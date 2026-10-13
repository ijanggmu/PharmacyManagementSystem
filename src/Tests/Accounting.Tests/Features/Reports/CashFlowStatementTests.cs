using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Reports.GetCashFlowClassifications;
using FSH.Modules.Accounting.Features.v1.Reports.GetCashFlowStatement;
using FSH.Modules.Accounting.Features.v1.Reports.GetPeriodTrialBalance;
using FSH.Modules.Accounting.Features.v1.Reports.GetProfitAndLoss;
using FSH.Modules.Accounting.Features.v1.Reports.UpdateCashFlowClassifications;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using NSubstitute;

namespace Accounting.Tests.Features.Reports;

/// <summary>
/// <see cref="GetCashFlowStatementQueryHandler"/>: the indirect-method statement reconciles to the change in cash and
/// bank on a seeded month with VAT, TDS, inventory, a fixed asset with depreciation, a loan, drawings, an opening
/// balance voucher inside the period and a year-end close — and the cash flow classification (defaults and tags).
/// </summary>
public sealed class CashFlowStatementTests : IDisposable
{
    private static readonly DateTime Before = new(2026, 7, 20, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime From = new(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime To = new(2026, 9, 30, 23, 59, 59, DateTimeKind.Utc);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly Dictionary<string, AccountingAccount> _a = new(StringComparer.Ordinal);
    private int _voucherNo;

    public CashFlowStatementTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<Guid?>(0));
        _currentUser.Name.Returns("accountant");
    }

    public void Dispose() => _db.Dispose();

    private async Task SeedChartAsync(bool withAccumulatedDepreciation = true)
    {
        var roots = new Dictionary<AccountingAccountType, AccountingAccount>();
        foreach (var type in Enum.GetValues<AccountingAccountType>())
        {
            roots[type] = await AccountingTestChart.RootAsync(_db, type);
        }

        void Add(string code, string name, AccountingAccountType type, string? parentCode = null)
        {
            Guid parentId = parentCode is null ? roots[type].Id : _a[parentCode].Id;
            var account = AccountingAccount.Create(code, name, type, isSystem: false, parentId);
            _db.Accounts.Add(account);
            _a[code] = account;
        }

        Add("1000", "Cash", AccountingAccountType.Asset);
        Add("1010", "Bank", AccountingAccountType.Asset);
        Add("1100", "Accounts Receivable", AccountingAccountType.Asset);
        Add("1150", "Input VAT Recoverable", AccountingAccountType.Asset);
        Add("1190", "Insurance Receivable", AccountingAccountType.Asset);
        Add("1200", "Inventory", AccountingAccountType.Asset);
        Add("1500", "Fixed Assets", AccountingAccountType.Asset);
        Add("1510", "Shop fit-out", AccountingAccountType.Asset, "1500");
        if (withAccumulatedDepreciation)
        {
            Add("1590", "Accumulated Depreciation", AccountingAccountType.Asset, "1500");
        }

        Add("2000", "Accounts Payable", AccountingAccountType.Liability);
        Add("2100", "VAT Payable", AccountingAccountType.Liability);
        Add("2150", "TDS Payable", AccountingAccountType.Liability);
        Add("2500", "Bank Loan", AccountingAccountType.Liability);
        Add("3000", "Owner's Equity", AccountingAccountType.Equity);
        Add("3100", "Drawings", AccountingAccountType.Equity);
        Add("3900", "Retained Earnings", AccountingAccountType.Equity);
        Add("4000", "Sales Revenue", AccountingAccountType.Revenue);
        Add("4500", "Interest Income", AccountingAccountType.Revenue);
        Add("5000", "Cost of Goods Sold", AccountingAccountType.Expense);
        Add("5100", "General Expenses", AccountingAccountType.Expense);
        Add("5200", "Depreciation Expense", AccountingAccountType.Expense);
        await _db.SaveChangesAsync();
    }

    private async Task PostAsync(DateTime date, string type, params (string Code, decimal Debit, decimal Credit)[] lines)
    {
        var voucher = AccountingVoucher.CreateDraft(date, type, AccountingVoucherSource.System, type);
        foreach (var (code, debit, credit) in lines)
        {
            voucher.AddLine(_a[code].Id, null, debit, credit);
        }

        voucher.Post($"V-{++_voucherNo}", "tester");
        _db.Vouchers.Add(voucher);
        await _db.SaveChangesAsync();
    }

    /// <summary>A month of pharmacy activity plus history before it.</summary>
    private async Task SeedMonthAsync(string depreciationCreditCode = "1590")
    {
        // Before the period: capital introduced (opening balance) and an earlier cash sale.
        await PostAsync(Before, "opening_balance", ("1000", 100_000m, 0m), ("3000", 0m, 100_000m));
        await PostAsync(Before.AddDays(5), "system_sale", ("1000", 1_130m, 0m), ("4000", 0m, 1_000m), ("2100", 0m, 130m));

        // Opening balance voucher dated inside the period: part of the opening position, not a cash flow.
        await PostAsync(From, "opening_balance", ("1010", 5_000m, 0m), ("3000", 0m, 5_000m));

        var d = From.AddDays(2);
        // Purchase on credit with input VAT.
        await PostAsync(d, "system_purchase", ("1200", 10_000m, 0m), ("1150", 1_300m, 0m), ("2000", 0m, 11_300m));
        // Cash sale with output VAT, and its cost.
        await PostAsync(d, "system_sale", ("1000", 9_040m, 0m), ("4000", 0m, 8_000m), ("2100", 0m, 1_040m));
        await PostAsync(d, "system_sale_cogs", ("5000", 5_000m, 0m), ("1200", 0m, 5_000m));
        // Credit sale (no VAT, medicines exempt).
        await PostAsync(d, "system_sale", ("1100", 2_000m, 0m), ("4000", 0m, 2_000m));
        // Supplier paid from the bank with TDS withheld.
        await PostAsync(d.AddDays(1), "system_payment", ("2000", 6_000m, 0m), ("1010", 0m, 5_910m), ("2150", 0m, 90m));
        // Fixed asset bought from the bank, and a month's depreciation.
        await PostAsync(d.AddDays(2), "journal", ("1510", 20_000m, 0m), ("1010", 0m, 20_000m));
        await PostAsync(d.AddDays(20), "journal", ("5200", 500m, 0m), (depreciationCreditCode, 0m, 500m));
        // Bank loan received, owner drawings, a cash expense, interest earned in the bank.
        await PostAsync(d.AddDays(3), "journal", ("1010", 15_000m, 0m), ("2500", 0m, 15_000m));
        await PostAsync(d.AddDays(4), "journal", ("3100", 1_000m, 0m), ("1000", 0m, 1_000m));
        await PostAsync(d.AddDays(5), "expense", ("5100", 700m, 0m), ("1000", 0m, 700m));
        await PostAsync(d.AddDays(6), "journal", ("1010", 60m, 0m), ("4500", 0m, 60m));
        // Year-end close at the period end: zeroes revenue and expense (incl. the earlier sale) into Retained Earnings.
        await PostAsync(To.AddHours(-1), FiscalYearCloseRules.VoucherType,
            ("4000", 11_000m, 0m), ("4500", 60m, 0m),
            ("5000", 0m, 5_000m), ("5100", 0m, 700m), ("5200", 0m, 500m), ("3900", 0m, 4_860m));
    }

    private IMediator Mediator()
    {
        var mediator = Substitute.For<IMediator>();
        var periodTrialBalance = new GetPeriodTrialBalanceQueryHandler(_db, _currentBranch);
#pragma warning disable CA2012 // NSubstitute stores the ValueTask as a configured return value.
        mediator.Send(Arg.Any<GetPeriodTrialBalanceQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci => periodTrialBalance.Handle(ci.ArgAt<GetPeriodTrialBalanceQuery>(0), CancellationToken.None));
#pragma warning restore CA2012
        return mediator;
    }

    private async Task<CashFlowStatementDto> CashFlowAsync(DateTime? from = null, DateTime? to = null) =>
        await new GetCashFlowStatementQueryHandler(_db, Mediator())
            .Handle(new GetCashFlowStatementQuery(from ?? From, to ?? To), CancellationToken.None);

    private static decimal Line(IEnumerable<CashFlowLineDto> lines, string key) => lines.Single(l => l.Key == key).Amount;

    [Fact]
    public async Task Handle_Should_Reconcile_To_ChangeInCashAndBank()
    {
        await SeedChartAsync();
        await SeedMonthAsync();

        var cf = await CashFlowAsync();

        // Net profit = the P&L before the close: 10,000 sales + 60 interest − 5,000 COGS − 700 − 500 depreciation.
        cf.NetProfit.ShouldBe(3_860m);
        var pl = await new GetProfitAndLossQueryHandler(_db, _currentBranch)
            .Handle(new GetProfitAndLossQuery(From, To), CancellationToken.None);
        cf.NetProfit.ShouldBe(pl.NetIncome);

        Line(cf.Adjustments, "depreciation").ShouldBe(500m);
        Line(cf.WorkingCapitalChanges, "receivables").ShouldBe(-2_000m);
        Line(cf.WorkingCapitalChanges, "inventory").ShouldBe(-5_000m);
        Line(cf.WorkingCapitalChanges, "input_vat").ShouldBe(-1_300m);
        Line(cf.WorkingCapitalChanges, "other_current_assets").ShouldBe(0m);
        Line(cf.WorkingCapitalChanges, "payables").ShouldBe(5_300m);
        Line(cf.WorkingCapitalChanges, "vat_payable").ShouldBe(1_040m);
        Line(cf.WorkingCapitalChanges, "tds_payable").ShouldBe(90m);
        Line(cf.WorkingCapitalChanges, "other_current_liabilities").ShouldBe(0m);
        cf.NetCashFromOperating.ShouldBe(2_490m);

        // Accumulated depreciation moved by exactly the charge, so no offset line.
        cf.InvestingLines.Select(l => l.Key).ShouldBe(["account:1510"]);
        cf.NetCashFromInvesting.ShouldBe(-20_000m);

        // Loan in, drawings out; the opening-balance equity and the year-end close are not financing flows.
        cf.FinancingLines.Select(l => (l.Key, l.Amount)).ShouldBe([("account:2500", 15_000m), ("account:3100", -1_000m)]);
        cf.NetCashFromFinancing.ShouldBe(14_000m);

        // Cash: +9,040 − 1,000 − 700; bank: −5,910 − 20,000 + 15,000 + 60.
        cf.NetChangeInCash.ShouldBe(-3_510m);
        cf.OpeningCash.ShouldBe(101_130m + 5_000m);
        cf.ClosingCash.ShouldBe(106_130m - 3_510m);
        cf.Difference.ShouldBe(0m);
        cf.IsReconciled.ShouldBeTrue();
        cf.CashAccounts.Select(a => a.AccountCode).ShouldBe(["1000", "1010"]);
        cf.CashAccounts.Sum(a => a.Closing - a.Opening).ShouldBe(cf.NetChangeInCash);
    }

    [Fact]
    public async Task Handle_Should_OffsetDepreciation_CreditedStraightToTheAsset()
    {
        await SeedChartAsync(withAccumulatedDepreciation: false);
        await SeedMonthAsync(depreciationCreditCode: "1510");

        var cf = await CashFlowAsync();

        Line(cf.Adjustments, "depreciation").ShouldBe(500m);
        // The asset line is net of the depreciation credited to it; the offset line restores the cash paid.
        Line(cf.InvestingLines, "account:1510").ShouldBe(-19_500m);
        Line(cf.InvestingLines, "non_cash_offset").ShouldBe(-500m);
        cf.NetCashFromInvesting.ShouldBe(-20_000m);
        cf.IsReconciled.ShouldBeTrue();
        cf.NetChangeInCash.ShouldBe(-3_510m);
    }

    [Fact]
    public async Task Handle_Should_Reconcile_AcrossSeveralPeriods_And_AnUnbrokenRange()
    {
        await SeedChartAsync();
        await SeedMonthAsync();

        var july = await CashFlowAsync(new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc), From.AddTicks(-1));
        var september = await CashFlowAsync();
        var both = await CashFlowAsync(new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc), To);

        july.IsReconciled.ShouldBeTrue();
        both.IsReconciled.ShouldBeTrue();
        both.ClosingCash.ShouldBe(september.ClosingCash);
        // Capital introduced by an opening-balance voucher is opening position, never financing.
        both.FinancingLines.ShouldNotContain(l => l.Key == "account:3000");
    }

    [Fact]
    public async Task Tags_Should_Reclassify_Accounts_And_StillReconcile()
    {
        await SeedChartAsync();
        await SeedMonthAsync();
        var update = new UpdateCashFlowClassificationsCommandHandler(_db, _currentUser);

        // Interest received under investing (NAS 7 allows it), the loan as operating (a tenant's choice).
        var result = await update.Handle(new UpdateCashFlowClassificationsCommand(
        [
            new CashFlowClassificationInput(_a["4500"].Id, "Investing"),
            new CashFlowClassificationInput(_a["2500"].Id, "operating"),
        ]), CancellationToken.None);

        result.Single(r => r.AccountCode == "4500").EffectiveActivity.ShouldBe("Investing");
        result.Single(r => r.AccountCode == "2500").Tag.ShouldBe("Operating");
        result.Single(r => r.AccountCode == "2500").DefaultActivity.ShouldBe("Financing");

        var cf = await CashFlowAsync();
        Line(cf.Adjustments, "reclassified").ShouldBe(-60m);
        Line(cf.InvestingLines, "account:4500").ShouldBe(60m);
        Line(cf.WorkingCapitalChanges, "other_current_liabilities").ShouldBe(15_000m);
        cf.FinancingLines.Select(l => l.Key).ShouldBe(["account:3100"]);
        cf.NetChangeInCash.ShouldBe(-3_510m);
        cf.IsReconciled.ShouldBeTrue();

        // Clearing the tag restores the default.
        await update.Handle(new UpdateCashFlowClassificationsCommand([new CashFlowClassificationInput(_a["2500"].Id, null)]), CancellationToken.None);
        var list = await new GetCashFlowClassificationsQueryHandler(_db).Handle(new GetCashFlowClassificationsQuery(), CancellationToken.None);
        list.Single(r => r.AccountCode == "2500").EffectiveActivity.ShouldBe("Financing");
        list.Single(r => r.AccountCode == "2500").Tag.ShouldBeNull();
    }

    [Fact]
    public async Task Tag_On_A_Group_Should_Apply_To_Its_SubAccounts()
    {
        await SeedChartAsync();
        var update = new UpdateCashFlowClassificationsCommandHandler(_db, _currentUser);

        await update.Handle(new UpdateCashFlowClassificationsCommand([new CashFlowClassificationInput(_a["1500"].Id, "Operating")]), CancellationToken.None);
        var list = await new GetCashFlowClassificationsQueryHandler(_db).Handle(new GetCashFlowClassificationsQuery(), CancellationToken.None);

        list.Single(r => r.AccountCode == "1510").EffectiveActivity.ShouldBe("Operating");
        list.Single(r => r.AccountCode == "1510").DefaultActivity.ShouldBe("Investing");
        // A sub-account's own default does not override an ancestor's explicit tag.
        list.Single(r => r.AccountCode == "1590").EffectiveActivity.ShouldBe("Operating");
        list.Single(r => r.AccountCode == "1500").IsPostable.ShouldBeFalse();
    }

    [Fact]
    public async Task Defaults_Should_Follow_Head_And_Name()
    {
        await SeedChartAsync();

        var list = await new GetCashFlowClassificationsQueryHandler(_db).Handle(new GetCashFlowClassificationsQuery(), CancellationToken.None);
        string Of(string code) => list.Single(r => r.AccountCode == code).EffectiveActivity;

        Of("1000").ShouldBe("Cash");
        Of("1010").ShouldBe("Cash");
        Of("1100").ShouldBe("Operating");
        Of("1200").ShouldBe("Operating");
        Of("1510").ShouldBe("Investing");
        Of("1590").ShouldBe("NonCash");
        Of("2000").ShouldBe("Operating");
        Of("2500").ShouldBe("Financing");
        Of("3000").ShouldBe("Financing");
        Of("3100").ShouldBe("Financing");
        Of("4000").ShouldBe("Operating");
        Of("5200").ShouldBe("NonCash");
        list.ShouldNotContain(r => r.AccountCode.Length == 1);
    }

    [Fact]
    public async Task Update_Should_Refuse_To_Tag_A_CashAccount()
    {
        await SeedChartAsync();
        var update = new UpdateCashFlowClassificationsCommandHandler(_db, _currentUser);

        await Should.ThrowAsync<CustomException>(async () => await update.Handle(
            new UpdateCashFlowClassificationsCommand([new CashFlowClassificationInput(_a["1010"].Id, "Investing")]),
            CancellationToken.None));
        await Should.ThrowAsync<NotFoundException>(async () => await update.Handle(
            new UpdateCashFlowClassificationsCommand([new CashFlowClassificationInput(Guid.CreateVersion7(), "Investing")]),
            CancellationToken.None));
    }

    [Theory]
    [InlineData("Operating", true)]
    [InlineData("noncash", true)]
    [InlineData(null, true)]
    [InlineData("Cash", false)]
    [InlineData("7", false)]
    public void Validator_Should_Accept_Only_Known_Activities(string? activity, bool valid)
    {
        var result = new UpdateCashFlowClassificationsCommandValidator()
            .Validate(new UpdateCashFlowClassificationsCommand([new CashFlowClassificationInput(Guid.CreateVersion7(), activity)]));

        result.IsValid.ShouldBe(valid);
    }
}
