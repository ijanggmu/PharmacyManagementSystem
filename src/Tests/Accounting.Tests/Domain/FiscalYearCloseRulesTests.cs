using FSH.Modules.Accounting.Domain;
using FSH.Modules.Sales.Contracts.Fiscal;

namespace Accounting.Tests.Domain;

public sealed class FiscalYearCloseRulesTests
{
    private static readonly Guid RetainedEarnings = Guid.NewGuid();
    private static readonly Guid Sales = Guid.NewGuid();
    private static readonly Guid SalesReturns = Guid.NewGuid();
    private static readonly Guid Cogs = Guid.NewGuid();

    [Fact]
    public void BuildClosingLines_Should_ZeroEveryAccount_And_CreditProfitToRetainedEarnings()
    {
        var (lines, netProfit) = FiscalYearCloseRules.BuildClosingLines(
            [
                new ProfitAndLossBalance(Sales, TotalDebit: 0m, TotalCredit: 1000m),
                new ProfitAndLossBalance(SalesReturns, TotalDebit: 50m, TotalCredit: 0m), // contra revenue (debit balance)
                new ProfitAndLossBalance(Cogs, TotalDebit: 600m, TotalCredit: 20m),
            ],
            RetainedEarnings);

        netProfit.ShouldBe(370m);
        lines.Single(l => l.AccountId == Sales).ShouldBe(new ClosingLine(Sales, 1000m, 0m));
        lines.Single(l => l.AccountId == SalesReturns).ShouldBe(new ClosingLine(SalesReturns, 0m, 50m));
        lines.Single(l => l.AccountId == Cogs).ShouldBe(new ClosingLine(Cogs, 0m, 580m));
        lines.Single(l => l.AccountId == RetainedEarnings).ShouldBe(new ClosingLine(RetainedEarnings, 0m, 370m));
        lines.Sum(l => l.DebitAmount).ShouldBe(lines.Sum(l => l.CreditAmount));
    }

    [Fact]
    public void BuildClosingLines_Should_DebitRetainedEarnings_When_Loss()
    {
        var (lines, netProfit) = FiscalYearCloseRules.BuildClosingLines(
            [new ProfitAndLossBalance(Sales, 0m, 100m), new ProfitAndLossBalance(Cogs, 250m, 0m)], RetainedEarnings);

        netProfit.ShouldBe(-150m);
        lines.Single(l => l.AccountId == RetainedEarnings).ShouldBe(new ClosingLine(RetainedEarnings, 150m, 0m));
        lines.Sum(l => l.DebitAmount).ShouldBe(lines.Sum(l => l.CreditAmount));
    }

    [Fact]
    public void BuildClosingLines_Should_SkipZeroBalances_And_ReturnNothing_When_AllZero()
    {
        var (lines, netProfit) = FiscalYearCloseRules.BuildClosingLines(
            [new ProfitAndLossBalance(Sales, 400m, 400m), new ProfitAndLossBalance(Cogs, 0m, 0m)], RetainedEarnings);

        lines.ShouldBeEmpty();
        netProfit.ShouldBe(0m);
    }

    [Fact]
    public void BuildClosingLines_Should_OmitRetainedEarningsLine_When_BreakEven()
    {
        var (lines, netProfit) = FiscalYearCloseRules.BuildClosingLines(
            [new ProfitAndLossBalance(Sales, 0m, 300m), new ProfitAndLossBalance(Cogs, 300m, 0m)], RetainedEarnings);

        netProfit.ShouldBe(0m);
        lines.Count.ShouldBe(2);
        lines.ShouldNotContain(l => l.AccountId == RetainedEarnings);
    }

    [Fact]
    public void ClosingVoucherType_Should_BeNumberedInTheJournalSeries()
    {
        VoucherSeries.ForVoucherType(FiscalYearCloseRules.VoucherType).ShouldBe(VoucherSeries.Journal);
    }

    [Fact]
    public void NepalFiscalYearRange_Should_RunFromShrawanToTheDayBeforeTheNextShrawan()
    {
        NepalFiscalYear.Range(2082).ShouldBe((new DateOnly(2025, 7, 17), new DateOnly(2026, 7, 16)));
        NepalFiscalYear.Range(2081).ShouldBe((new DateOnly(2024, 7, 16), new DateOnly(2025, 7, 16)));
        Should.Throw<ArgumentOutOfRangeException>(() => NepalFiscalYear.Range(NepalFiscalYear.FirstStartYear - 1));
    }
}
