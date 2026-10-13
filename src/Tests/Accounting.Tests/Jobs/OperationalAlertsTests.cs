using System.Security.Claims;
using FSH.Framework.Shared.Constants;
using FSH.Modules.Accounting.Contracts.Alerts;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Jobs.OperationalAlerts;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Mediator;
using NSubstitute;

namespace Accounting.Tests.Jobs;

public sealed class OperationalAlertSettingsTests
{
    [Fact]
    public void Missing_Settings_Use_Defaults()
    {
        var settings = OperationalAlertSettings.From(new Dictionary<string, string>());

        settings.ShouldBe(new OperationalAlertSettings(true, 60, 30, 7));
        OperationalAlertSettings.From(null).ShouldBe(OperationalAlertSettings.Default);
    }

    [Fact]
    public void Values_Are_Parsed_Clamped_And_Snapped()
    {
        var settings = OperationalAlertSettings.From(new Dictionary<string, string>
        {
            [OperationalAlertSettings.EnabledKey] = " False ",
            [OperationalAlertSettings.ExpiryDaysKey] = "1000",
            [OperationalAlertSettings.OverdueDaysKey] = "75",
            [OperationalAlertSettings.RepeatDaysKey] = "0",
        });

        settings.Enabled.ShouldBeFalse();
        settings.ExpiryDays.ShouldBe(365);
        settings.OverdueDays.ShouldBe(60);
        settings.RepeatAfterDays.ShouldBe(1);
    }

    [Fact]
    public void Garbage_Values_Fall_Back_To_Defaults_And_Keep_The_Scan_On()
    {
        var settings = OperationalAlertSettings.From(new Dictionary<string, string>
        {
            [OperationalAlertSettings.EnabledKey] = "maybe",
            [OperationalAlertSettings.ExpiryDaysKey] = "sixty",
            [OperationalAlertSettings.OverdueDaysKey] = "",
        });

        settings.ShouldBe(OperationalAlertSettings.Default);
    }

    [Theory]
    [InlineData(10, 30)]
    [InlineData(30, 30)]
    [InlineData(59, 30)]
    [InlineData(60, 60)]
    [InlineData(89, 60)]
    [InlineData(90, 90)]
    [InlineData(365, 90)]
    public void Overdue_Days_Snap_Down_To_Aging_Buckets(int days, int expected) =>
        OperationalAlertSettings.SnapOverdueDays(days).ShouldBe(expected);
}

public sealed class OperationalAlertDigestsTests
{
    private static ReorderSuggestionDto Reorder(string name, decimal level, decimal onHand) =>
        new(Guid.NewGuid(), name, level, onHand, (level * 2) - onHand);

    private static ExpiringBatchDto Batch(string name, int days, decimal qty = 10m) =>
        new(Guid.NewGuid(), Guid.NewGuid(), name, "B-" + name, new DateOnly(2026, 10, 13).AddDays(days), days, qty);

    [Fact]
    public void LowStock_Skips_Untracked_Reorder_Levels_And_Lists_Most_Urgent_First()
    {
        var digest = OperationalAlertDigests.LowStock(
        [
            Reorder("Cetirizine", 10m, 4m),
            Reorder("Paracetamol", 20m, 0m),
            Reorder("Discontinued", 0m, 0m),     // reorder level 0 = not tracked
            Reorder("Amoxicillin", 15m, 16m),    // above level — not low (defensive)
        ]);

        digest.ShouldNotBeNull();
        digest.Category.ShouldBe(OperationalAlertCategories.LowStock);
        digest.ItemCount.ShouldBe(2);
        digest.Title.ShouldBe("2 medicines are at or below the reorder level");
        digest.Body.ShouldStartWith("1 is out of stock. Paracetamol (0 left, reorder at 20), Cetirizine");
        digest.Body.ShouldNotContain("Discontinued");
        digest.Link.ShouldBe(OperationalAlertDigests.LowStockLink);
    }

    [Fact]
    public void LowStock_Returns_Null_When_Nothing_Is_Low() =>
        OperationalAlertDigests.LowStock([Reorder("Zinc", 0m, 0m)]).ShouldBeNull();

    [Fact]
    public void ExpiringBatches_Applies_The_Window_And_Flags_Expired_Batches()
    {
        var digest = OperationalAlertDigests.ExpiringBatches(
        [
            Batch("Late", 61),           // outside a 60-day window
            Batch("Soon", 5),
            Batch("Gone", -2),
            Batch("Empty", 3, qty: 0m),  // nothing on hand
        ], withinDays: 60);

        digest.ShouldNotBeNull();
        digest.ItemCount.ShouldBe(2);
        digest.Title.ShouldBe("2 batches expire within 60 days");
        digest.Body.ShouldStartWith("1 batch has already expired");
        digest.Body.ShouldContain("Gone batch B-Gone (expired 2 days ago, 10 on hand), Soon batch B-Soon (expires in 5 days");
        digest.Body.ShouldNotContain("Late");
    }

    [Fact]
    public void Digest_Names_Five_Items_Then_Counts_The_Rest()
    {
        var rows = Enumerable.Range(1, 8).Select(i => Batch($"M{i}", i)).ToList();

        var digest = OperationalAlertDigests.ExpiringBatches(rows, 60)!;

        digest.Body.ShouldEndWith("and 3 more.");
        digest.Body.ShouldNotContain("M6");
    }

    [Theory]
    [InlineData(30, 600)]
    [InlineData(45, 600)]
    [InlineData(60, 500)]
    [InlineData(90, 300)]
    public void OverdueAmount_Uses_The_Aging_Buckets_Past_The_Threshold(int overdueDays, decimal expected) =>
        OperationalAlertDigests.OverdueAmount(100m, 200m, 300m, overdueDays).ShouldBe(expected);

    [Fact]
    public void PayablesOverdue_Totals_Only_The_Overdue_Part_And_Ignores_Current_Bills()
    {
        var digest = OperationalAlertDigests.PayablesOverdue(
        [
            new ApAgingReportLineDto(Guid.NewGuid(), "Current Pharma", 5000m, 0m, 0m, 0m, 5000m),
            new ApAgingReportLineDto(Guid.NewGuid(), "Old Traders", 1000m, 2000m, 0m, 500m, 3500m),
        ], overdueDays: 30);

        digest.ShouldNotBeNull();
        digest.ItemCount.ShouldBe(1);
        digest.Title.ShouldBe("Rs 2,500 of supplier bills unpaid for over 30 days");
        digest.Body.ShouldBe("1 supplier is waiting: Old Traders (Rs 2,500).");
        digest.Link.ShouldBe(OperationalAlertDigests.PayablesLink);
    }

    [Fact]
    public void ChequesDue_Lists_Cheques_In_Play_Whose_Date_Has_Come()
    {
        var today = new DateOnly(2026, 6, 1);
        static ChequeDto Cheque(string direction, string status, string party, decimal amount, DateTime date) =>
            new(Guid.NewGuid(), direction, status, Guid.NewGuid(), party, null, "00" + party.Length, date, amount,
                "CustomerPayment", Guid.NewGuid(), date.AddDays(-20), false, null, null, null, null, null, date);

        var digest = OperationalAlertDigests.ChequesDue(
        [
            Cheque(ChequeValues.Received, ChequeValues.StatusOnHand, "Himal Pharma", 5000m, new DateTime(2026, 5, 31, 18, 15, 0, DateTimeKind.Utc)),
            Cheque(ChequeValues.Issued, ChequeValues.StatusIssued, "Deurali Janta", 9000m, new DateTime(2026, 5, 20, 0, 0, 0, DateTimeKind.Utc)),
            Cheque(ChequeValues.Received, ChequeValues.StatusCleared, "Done Ltd", 100m, new DateTime(2026, 5, 1, 0, 0, 0, DateTimeKind.Utc)),
            Cheque(ChequeValues.Received, ChequeValues.StatusOnHand, "Later Ltd", 700m, new DateTime(2026, 6, 10, 0, 0, 0, DateTimeKind.Utc)),
        ], today);

        digest.ShouldNotBeNull();
        digest.Category.ShouldBe(OperationalAlertCategories.ChequesDue);
        digest.ItemCount.ShouldBe(2);
        digest.Title.ShouldBe("2 cheques are due (Rs 14,000)");
        digest.Body.ShouldContain("1 to deposit");
        digest.Body.ShouldContain("Himal Pharma");
        digest.Body.ShouldContain("keep the bank funded");
        digest.Link.ShouldBe(OperationalAlertDigests.ChequesLink);
        OperationalAlertDigests.ChequesDue([], today).ShouldBeNull();
    }

    [Fact]
    public void ReceivablesOverdue_Respects_A_Longer_Threshold()
    {
        var rows = new[]
        {
            new ArAgingReportLineDto(Guid.NewGuid(), "Ram", 0m, 800m, 0m, 0m, 800m),
            new ArAgingReportLineDto(Guid.NewGuid(), "Sita", 0m, 0m, 0m, 1200m, 1200m),
        };

        OperationalAlertDigests.ReceivablesOverdue(rows, 30)!.ItemCount.ShouldBe(2);
        var over90 = OperationalAlertDigests.ReceivablesOverdue(rows, 90)!;
        over90.ItemCount.ShouldBe(1);
        over90.Body.ShouldContain("Sita (Rs 1,200)");
        OperationalAlertDigests.ReceivablesOverdue([rows[0]], 60).ShouldBeNull();
    }

    [Fact]
    public void Signature_Is_Order_Independent_And_Changes_With_The_Set()
    {
        Guid a = Guid.NewGuid(), b = Guid.NewGuid(), c = Guid.NewGuid();

        OperationalAlertDigests.Signature([a, b]).ShouldBe(OperationalAlertDigests.Signature([b, a, a]));
        OperationalAlertDigests.Signature([a, b]).ShouldNotBe(OperationalAlertDigests.Signature([a, b, c]));
        OperationalAlertDigests.Signature([a]).Length.ShouldBe(16);
    }
}

public sealed class OperationalAlertDedupeTests
{
    private const string Cat = OperationalAlertCategories.LowStock;
    private static readonly DateOnly Today = new(2026, 10, 13);

    private static string KeyOn(DateOnly date, string signature, string scope = OperationalAlertDedupe.AllBranchesScope) =>
        OperationalAlertDedupe.Key(Cat, scope, date, signature);

    [Fact]
    public void A_First_Digest_Is_Delivered() =>
        OperationalAlertDedupe.IsSuppressed([], Cat, "all", Today, "AAA", 7).ShouldBeFalse();

    [Fact]
    public void Only_One_Digest_Per_Category_A_Day_Even_If_The_Items_Changed() =>
        OperationalAlertDedupe.IsSuppressed([KeyOn(Today, "OLD")], Cat, "all", Today, "NEW", 7).ShouldBeTrue();

    [Fact]
    public void An_Unchanged_Digest_Waits_For_The_Repeat_Window()
    {
        OperationalAlertDedupe.IsSuppressed([KeyOn(Today.AddDays(-1), "SAME")], Cat, "all", Today, "SAME", 7).ShouldBeTrue();
        OperationalAlertDedupe.IsSuppressed([KeyOn(Today.AddDays(-6), "SAME")], Cat, "all", Today, "SAME", 7).ShouldBeTrue();
        OperationalAlertDedupe.IsSuppressed([KeyOn(Today.AddDays(-7), "SAME")], Cat, "all", Today, "SAME", 7).ShouldBeFalse();
    }

    [Fact]
    public void A_Changed_Digest_Goes_Out_The_Next_Day() =>
        OperationalAlertDedupe.IsSuppressed([KeyOn(Today.AddDays(-1), "OLD")], Cat, "all", Today, "NEW", 7).ShouldBeFalse();

    [Fact]
    public void Other_Scopes_Categories_And_Malformed_Keys_Are_Ignored()
    {
        string branch = OperationalAlertDedupe.ScopeKey(Guid.NewGuid());
        string[] existing =
        [
            KeyOn(Today, "SAME", branch),
            OperationalAlertDedupe.Key(OperationalAlertCategories.ExpiringBatches, "all", Today, "SAME"),
            "ops:low_stock:all:garbage",
            "license.expiry:abc",
        ];

        OperationalAlertDedupe.IsSuppressed(existing, Cat, "all", Today, "SAME", 7).ShouldBeFalse();
    }

    [Fact]
    public void Key_Fits_The_Notification_Column()
    {
        string key = OperationalAlertDedupe.Key(
            OperationalAlertCategories.ReceivablesOverdue, OperationalAlertDedupe.ScopeKey(Guid.NewGuid()), Today, new string('F', 16));

        key.Length.ShouldBeLessThanOrEqualTo(128);
        OperationalAlertDedupe.ScopeKey(null).ShouldBe("all");
    }
}

public sealed class OperationalAlertRecipientsTests
{
    [Fact]
    public void A_Manager_With_Every_Permission_Gets_Every_Category()
    {
        var categories = OperationalAlertRecipients.CategoriesFor(
        [
            InventoryPermissions.Reports.View, InventoryPermissions.Batches.AdjustStock,
            AccountingPermissions.Reports.View, SuppliersPermissions.Ledger.RecordPayment, CustomersPermissions.Ledger.RecordPayment,
            AccountingPermissions.Banking.View, AccountingPermissions.Banking.RecordDeposit,
        ]);

        categories.ShouldBe(OperationalAlertCategories.All);
    }

    [Fact]
    public void View_Only_Roles_Get_Nothing()
    {
        // A pharmacist/cashier can open the reports but cannot act on them.
        OperationalAlertRecipients.CategoriesFor(
        [
            InventoryPermissions.Reports.View, InventoryPermissions.Batches.View,
            AccountingPermissions.Reports.View, CustomersPermissions.Ledger.View,
        ]).ShouldBeEmpty();
        OperationalAlertRecipients.CategoriesFor(null).ShouldBeEmpty();
    }

    [Fact]
    public void Each_Category_Needs_Both_Its_View_And_Action_Permission()
    {
        OperationalAlertRecipients.CategoriesFor([AccountingPermissions.Reports.View, SuppliersPermissions.Ledger.RecordPayment])
            .ShouldBe([OperationalAlertCategories.PayablesOverdue]);
        OperationalAlertRecipients.CategoriesFor([SuppliersPermissions.Ledger.RecordPayment]).ShouldBeEmpty();
        OperationalAlertRecipients.CategoriesFor([InventoryPermissions.Batches.AdjustStock, InventoryPermissions.Reports.View])
            .ShouldBe([OperationalAlertCategories.LowStock, OperationalAlertCategories.ExpiringBatches]);
    }
}

public sealed class OperationalAlertsJobTests
{
    private static readonly DateTime Now = new(2026, 10, 13, 1, 0, 0, DateTimeKind.Utc);
    private readonly IMediator _mediator = Substitute.For<IMediator>();

    [Fact]
    public async Task BuildDigest_Runs_The_Category_Report_In_The_Given_Branch_With_The_Tenant_Thresholds()
    {
        var branchId = Guid.NewGuid();
        var settings = new OperationalAlertSettings(true, ExpiryDays: 45, OverdueDays: 30, RepeatAfterDays: 7);
        _mediator.Send(Arg.Is<GetExpiringBatchesQuery>(q => q.WithinDays == 45 && q.BranchId == branchId), Arg.Any<CancellationToken>())
            .Returns(new List<ExpiringBatchDto> { new(Guid.NewGuid(), Guid.NewGuid(), "Insulin", "X1", new DateOnly(2026, 11, 1), 19, 4m, branchId) });

        var digest = await OperationalAlertsJob.BuildDigestAsync(
            _mediator, OperationalAlertCategories.ExpiringBatches, branchId, settings, Now, CancellationToken.None);

        digest.ShouldNotBeNull();
        digest.Title.ShouldBe("1 batch expires within 45 days");
    }

    [Fact]
    public async Task BuildDigest_Ages_Dues_As_Of_Now()
    {
        _mediator.Send(Arg.Is<GetApAgingReportQuery>(q => q.AsOfUtc == Now && q.BranchId == null), Arg.Any<CancellationToken>())
            .Returns(new List<ApAgingReportLineDto> { new(Guid.NewGuid(), "Supplier", 0m, 0m, 0m, 900m, 900m) });
        _mediator.Send(Arg.Any<GetArAgingReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<ArAgingReportLineDto>());
        _mediator.Send(Arg.Any<GetReorderSuggestionsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<ReorderSuggestionDto>());

        var settings = OperationalAlertSettings.Default;
        (await OperationalAlertsJob.BuildDigestAsync(_mediator, OperationalAlertCategories.PayablesOverdue, null, settings, Now, CancellationToken.None))
            .ShouldNotBeNull().ItemCount.ShouldBe(1);
        (await OperationalAlertsJob.BuildDigestAsync(_mediator, OperationalAlertCategories.ReceivablesOverdue, null, settings, Now, CancellationToken.None))
            .ShouldBeNull();
        (await OperationalAlertsJob.BuildDigestAsync(_mediator, OperationalAlertCategories.LowStock, null, settings, Now, CancellationToken.None))
            .ShouldBeNull();
        (await OperationalAlertsJob.BuildDigestAsync(_mediator, "unknown", null, settings, Now, CancellationToken.None))
            .ShouldBeNull();
    }

    [Fact]
    public void JobPrincipal_Is_An_Authenticated_Identity_For_The_User_And_Tenant()
    {
        var principal = OperationalAlertsJob.JobPrincipal("user-1", "acme");

        principal.Identity!.IsAuthenticated.ShouldBeTrue();
        principal.FindFirstValue(ClaimTypes.NameIdentifier).ShouldBe("user-1");
        principal.FindFirstValue(CustomClaims.Tenant).ShouldBe("acme");
    }
}
