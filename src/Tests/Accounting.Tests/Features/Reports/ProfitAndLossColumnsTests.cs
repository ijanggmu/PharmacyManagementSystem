using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Reports.GetProfitAndLoss;
using FSH.Modules.Accounting.Features.v1.Reports.GetProfitAndLossColumns;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Accounting.Tests.Features.Reports;

/// <summary><see cref="GetProfitAndLossColumnsQueryHandler"/>: each column equals the single-period P&amp;L (year-end
/// close excluded), for comparatives and the twelve-month trend.</summary>
public sealed class ProfitAndLossColumnsTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private AccountingAccount _cash = default!;
    private AccountingAccount _sales = default!;
    private AccountingAccount _rent = default!;
    private AccountingAccount _retained = default!;

    public ProfitAndLossColumnsTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<Guid?>(0));
    }

    public void Dispose() => _db.Dispose();

    private static DateTime Day(int month, int day) => new(2026, month, day, 0, 0, 0, DateTimeKind.Utc);

    private static ReportPeriod Month(int month) =>
        new(Day(month, 1), Day(month, 1).AddMonths(1).AddTicks(-1));

    private async Task SeedAsync()
    {
        _cash = await AccountingTestChart.AddAsync(_db, "1000", AccountingAccountType.Asset);
        _retained = await AccountingTestChart.AddAsync(_db, "3900", AccountingAccountType.Equity);
        _sales = await AccountingTestChart.AddAsync(_db, "4000", AccountingAccountType.Revenue);
        _rent = await AccountingTestChart.AddAsync(_db, "5100", AccountingAccountType.Expense);

        await VoucherSeed.PostedAsync(_db, Day(7, 10), "S-1", _cash.Id, _sales.Id, 1_000m);
        await VoucherSeed.PostedAsync(_db, Day(8, 10), "S-2", _cash.Id, _sales.Id, 1_500m);
        await VoucherSeed.PostedAsync(_db, Day(8, 15), "E-1", _rent.Id, _cash.Id, 400m);
        // Closing entry at the end of August: must not zero August's figures.
        await VoucherSeed.PostedAsync(_db, Day(8, 31), "YE-1", _sales.Id, _retained.Id, 2_500m, FiscalYearCloseRules.VoucherType);
    }

    private GetProfitAndLossColumnsQueryHandler Sut() => new(_db, _currentBranch);

    [Fact]
    public async Task Columns_Should_Equal_SinglePeriod_ProfitAndLoss()
    {
        await SeedAsync();
        ReportPeriod[] periods = [Month(7), Month(8), Month(9), new(Day(7, 1), Month(9).ToUtc)];

        var result = await Sut().Handle(new GetProfitAndLossColumnsQuery(periods), CancellationToken.None);

        result.Columns.Count.ShouldBe(4);
        for (int i = 0; i < periods.Length; i++)
        {
            var single = await new GetProfitAndLossQueryHandler(_db, _currentBranch)
                .Handle(new GetProfitAndLossQuery(periods[i].FromUtc, periods[i].ToUtc), CancellationToken.None);
            result.Columns[i].TotalRevenue.ShouldBe(single.TotalRevenue);
            result.Columns[i].TotalExpense.ShouldBe(single.TotalExpense);
            result.Columns[i].NetIncome.ShouldBe(single.NetIncome);
        }

        result.Lines.Select(l => l.AccountCode).ShouldBe(["4000", "5100"]);
        result.Lines[0].Amounts.ShouldBe([1_000m, 1_500m, 0m, 2_500m]);
        result.Lines[1].Amounts.ShouldBe([0m, 400m, 0m, 400m]);
        result.Columns.Select(c => c.NetIncome).ShouldBe([1_000m, 1_100m, 0m, 2_100m]);
    }

    [Fact]
    public async Task Trend_Months_Should_Add_Up_To_The_Whole_Range()
    {
        await SeedAsync();
        var months = Enumerable.Range(7, 3).Select(Month).ToList();

        var trend = await Sut().Handle(new GetProfitAndLossColumnsQuery(months), CancellationToken.None);
        var whole = await new GetProfitAndLossQueryHandler(_db, _currentBranch)
            .Handle(new GetProfitAndLossQuery(months[0].FromUtc, months[^1].ToUtc), CancellationToken.None);

        trend.Columns.Sum(c => c.NetIncome).ShouldBe(whole.NetIncome);
    }

    [Fact]
    public void Validator_Should_Limit_Periods_And_Order_Bounds()
    {
        var validator = new GetProfitAndLossColumnsQueryValidator();

        validator.Validate(new GetProfitAndLossColumnsQuery([Month(7)])).IsValid.ShouldBeTrue();
        validator.Validate(new GetProfitAndLossColumnsQuery([])).IsValid.ShouldBeFalse();
        validator.Validate(new GetProfitAndLossColumnsQuery(Enumerable.Range(0, 14).Select(_ => Month(7)).ToList())).IsValid.ShouldBeFalse();
        validator.Validate(new GetProfitAndLossColumnsQuery([new ReportPeriod(Day(8, 1), Day(7, 1))])).IsValid.ShouldBeFalse();
    }
}
