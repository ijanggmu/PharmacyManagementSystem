using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Domain;

namespace Accounting.Tests.Domain;

public sealed class OpeningBalanceRulesTests
{
    private static readonly Guid Cash = Guid.CreateVersion7();
    private static readonly Guid Stock = Guid.CreateVersion7();
    private static readonly Guid Payables = Guid.CreateVersion7();
    private static readonly Guid Equity = Guid.CreateVersion7();

    private static OpeningBalanceEntry Dr(Guid id, string code, decimal amount) => new(id, code, $"Account {code}", "Asset", amount, 0m);
    private static OpeningBalanceEntry Cr(Guid id, string code, decimal amount) => new(id, code, $"Account {code}", "Liability", 0m, amount);

    [Fact]
    public void BuildVoucherLines_Should_CreditEquityWithTheDifference_When_DebitsExceedCredits()
    {
        var lines = OpeningBalanceRules.BuildVoucherLines([Dr(Cash, "1000", 5000m), Dr(Stock, "1200", 20000m), Cr(Payables, "2000", 8000m)], Equity);

        lines.Count.ShouldBe(4);
        lines.Sum(l => l.DebitAmount).ShouldBe(lines.Sum(l => l.CreditAmount));
        var plug = lines[^1];
        plug.AccountId.ShouldBe(Equity);
        plug.CreditAmount.ShouldBe(17000m);
        plug.DebitAmount.ShouldBe(0m);
        plug.Description.ShouldBe(OpeningBalanceRules.DifferenceDescription);
    }

    [Fact]
    public void BuildVoucherLines_Should_DebitEquity_When_CreditsExceedDebits()
    {
        var lines = OpeningBalanceRules.BuildVoucherLines([Dr(Cash, "1000", 100m), Cr(Payables, "2000", 350.50m)], Equity);

        lines.Sum(l => l.DebitAmount).ShouldBe(lines.Sum(l => l.CreditAmount));
        lines[^1].DebitAmount.ShouldBe(250.50m);
    }

    [Fact]
    public void BuildVoucherLines_Should_AddNoEquityLine_When_EntriesBalance()
    {
        var lines = OpeningBalanceRules.BuildVoucherLines([Dr(Cash, "1000", 900m), Cr(Payables, "2000", 900m)], Equity);

        lines.Count.ShouldBe(2);
        lines.ShouldNotContain(l => l.AccountId == Equity);
    }

    [Fact]
    public void BuildVoucherLines_Should_OrderEnteredLinesByCode()
    {
        var lines = OpeningBalanceRules.BuildVoucherLines([Cr(Payables, "2000", 1m), Dr(Cash, "1000", 1m)], Equity);

        lines.Select(l => l.AccountId).ShouldBe([Cash, Payables]);
    }

    [Fact]
    public void ValidateLines_Should_Reject_EmptySet()
    {
        Should.Throw<CustomException>(() => OpeningBalanceRules.ValidateLines([]))
            .Message.ShouldContain("at least one");
    }

    [Theory]
    [InlineData(-1, 0)]
    [InlineData(10, 10)]
    [InlineData(0, 0)]
    [InlineData(1.005, 0)]
    public void ValidateLines_Should_Reject_InvalidAmounts(decimal debit, decimal credit)
    {
        Should.Throw<CustomException>(() =>
            OpeningBalanceRules.ValidateLines([new OpeningBalanceEntry(Cash, "1000", "Cash", "Asset", debit, credit)]));
    }

    [Fact]
    public void ValidateLines_Should_Reject_DuplicateAccounts()
    {
        Should.Throw<CustomException>(() => OpeningBalanceRules.ValidateLines([Dr(Cash, "1000", 1m), Dr(Cash, "1000", 2m)]))
            .Message.ShouldContain("more than once");
    }

    [Fact]
    public void BuildChanges_Should_ListOnlyChangedAccounts_WithBeforeAndAfter()
    {
        var before = new[] { Dr(Cash, "1000", 100m), Dr(Stock, "1200", 500m), Cr(Payables, "2000", 50m) };
        var after = new[] { Dr(Cash, "1000", 100m), Dr(Stock, "1200", 650m), Dr(Equity, "3000", 1m) };

        var changes = OpeningBalanceRules.BuildChanges(before, after);

        changes.Select(c => c.AccountCode).ShouldBe(["1200", "2000", "3000"]);
        var stock = changes[0];
        (stock.BeforeDebit, stock.AfterDebit).ShouldBe((500m, 650m));
        var payables = changes[1];
        (payables.BeforeCredit, payables.AfterCredit).ShouldBe((50m, 0m));
        changes[2].BeforeDebit.ShouldBe(0m);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void RequireReason_Should_Reject_Blank(string? reason)
    {
        Should.Throw<CustomException>(() => OpeningBalanceRules.RequireReason(reason));
    }

    [Fact]
    public void RequireReason_Should_Trim_And_CapLength()
    {
        OpeningBalanceRules.RequireReason("  stock recount  ").ShouldBe("stock recount");
        Should.Throw<CustomException>(() => OpeningBalanceRules.RequireReason(new string('x', OpeningBalanceRules.MaxReasonLength + 1)));
    }

    [Fact]
    public void HistoryEntry_Should_RequireReasonAndReversal_For_EditAndReset()
    {
        Should.Throw<ArgumentException>(() => OpeningBalanceHistoryEntry.Record(
            Guid.CreateVersion7(), Guid.CreateVersion7(), 2, OpeningBalanceAction.Reset, null, new DateOnly(2026, 7, 16),
            null, Guid.CreateVersion7(), Guid.CreateVersion7(), [], [], reason: null, Guid.CreateVersion7(), "admin"));

        Should.Throw<ArgumentException>(() => OpeningBalanceHistoryEntry.Record(
            Guid.CreateVersion7(), Guid.CreateVersion7(), 2, OpeningBalanceAction.Edit, new DateOnly(2026, 7, 16), new DateOnly(2026, 7, 16),
            Guid.CreateVersion7(), reversedVoucherId: null, reversalVoucherId: null, [Dr(Cash, "1000", 1m)], [], "fix", Guid.CreateVersion7(), "admin"));
    }

    [Fact]
    public void HistoryEntry_Should_RoundTripEntriesAndChanges_And_ComputeTotals()
    {
        var entries = new[] { Dr(Cash, "1000", 1200.25m), Cr(Payables, "2000", 200m) };
        var entry = OpeningBalanceHistoryEntry.Record(
            Guid.CreateVersion7(), Guid.CreateVersion7(), 1, OpeningBalanceAction.Set, new DateOnly(2026, 7, 16), null,
            Guid.CreateVersion7(), null, null, entries, OpeningBalanceRules.BuildChanges([], entries), null, Guid.CreateVersion7(), "admin");

        entry.ReadEntries().ShouldBe(entries);
        entry.ReadChanges().Count.ShouldBe(2);
        (entry.TotalDebit, entry.TotalCredit).ShouldBe((1200.25m, 200m));
        (entry.EquityAdjustmentDebit, entry.EquityAdjustmentCredit).ShouldBe((0m, 1000.25m));
        entry.LeavesActiveOpening.ShouldBeTrue();
    }

    [Fact]
    public void EnsureNoSubledgerControlLines_Should_Refuse_NewControlLine_NamingWhereToEnterIt()
    {
        var controls = new HashSet<Guid> { Stock, Payables };

        var ex = Should.Throw<CustomException>(() => OpeningBalanceRules.EnsureNoSubledgerControlLines(
            [Dr(Cash, "1000", 100m), Dr(Stock, "1200", 500m), Cr(Payables, "2000", 50m)], controls, []));

        ex.Message.ShouldContain("1200");
        ex.Message.ShouldContain("opening stock");
        ex.Message.ShouldContain("2000");
        ex.Message.ShouldContain("supplier");
    }

    [Fact]
    public void EnsureNoSubledgerControlLines_Should_Allow_LegacyControlLine_CarriedOverUnchanged_OrRemoved()
    {
        var controls = new HashSet<Guid> { Stock };
        var current = new[] { Dr(Cash, "1000", 100m), Dr(Stock, "1200", 500m) };

        Should.NotThrow(() => OpeningBalanceRules.EnsureNoSubledgerControlLines(
            [Dr(Cash, "1000", 250m), Dr(Stock, "1200", 500m)], controls, current));
        Should.NotThrow(() => OpeningBalanceRules.EnsureNoSubledgerControlLines([Dr(Cash, "1000", 250m)], controls, current));
    }

    [Fact]
    public void EnsureNoSubledgerControlLines_Should_Refuse_ChangedLegacyControlLine()
    {
        var controls = new HashSet<Guid> { Stock };
        var current = new[] { Dr(Stock, "1200", 500m) };

        Should.Throw<CustomException>(() => OpeningBalanceRules.EnsureNoSubledgerControlLines(
            [Dr(Stock, "1200", 650m)], controls, current)).Message.ShouldContain("1200");
    }
}
