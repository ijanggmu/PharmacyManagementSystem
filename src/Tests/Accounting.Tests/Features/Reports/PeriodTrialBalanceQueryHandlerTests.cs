using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Reports.GetPeriodTrialBalance;
using FSH.Modules.Accounting.Features.v1.Reports.GetTrialBalance;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Accounting.Tests.Features.Reports;

/// <summary>
/// <see cref="GetPeriodTrialBalanceQueryHandler"/> (opening / movement / opening-voucher split) and the shared
/// ledger rule every report uses: a reversed voucher stays in the ledger next to its reversal so the pair nets
/// to zero, while a voucher voided outright and drafts drop out.
/// </summary>
public sealed class PeriodTrialBalanceQueryHandlerTests : IDisposable
{
    private static readonly DateTime GoLive = new(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime PeriodFrom = new(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime PeriodTo = new(2026, 9, 30, 23, 59, 59, DateTimeKind.Utc);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private AccountingAccount _cash = default!;
    private AccountingAccount _capital = default!;
    private AccountingAccount _sales = default!;

    public PeriodTrialBalanceQueryHandlerTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<Guid?>(0));
    }

    public void Dispose() => _db.Dispose();

    private async Task SeedChartAsync()
    {
        _cash = await AccountingTestChart.AddAsync(_db, "1000", AccountingAccountType.Asset);
        _capital = await AccountingTestChart.AddAsync(_db, "3000", AccountingAccountType.Equity);
        _sales = await AccountingTestChart.AddAsync(_db, "4000", AccountingAccountType.Revenue);
    }

    private GetPeriodTrialBalanceQueryHandler Sut() => new(_db, _currentBranch);

    [Fact]
    public async Task Handle_Should_SplitOpeningAndMovement_At_PeriodStart()
    {
        await SeedChartAsync();
        await VoucherSeed.PostedAsync(_db, GoLive, "OB-1", _cash.Id, _capital.Id, 1000m, "opening_balance");
        await VoucherSeed.PostedAsync(_db, GoLive.AddDays(10), "SV-1", _cash.Id, _sales.Id, 200m);
        await VoucherSeed.PostedAsync(_db, PeriodFrom.AddDays(3), "SV-2", _cash.Id, _sales.Id, 50m);
        await VoucherSeed.PostedAsync(_db, PeriodTo.AddDays(1), "SV-3", _cash.Id, _sales.Id, 999m); // after the period

        var result = await Sut().Handle(new GetPeriodTrialBalanceQuery(PeriodFrom, PeriodTo), CancellationToken.None);

        var cash = result.Lines.Single(l => l.AccountCode == "1000");
        cash.OpeningDebit.ShouldBe(1200m);
        cash.OpeningCredit.ShouldBe(0m);
        cash.PeriodDebit.ShouldBe(50m);
        cash.PeriodCredit.ShouldBe(0m);
        cash.OpeningVoucherDebit.ShouldBe(0m);

        var sales = result.Lines.Single(l => l.AccountCode == "4000");
        sales.OpeningCredit.ShouldBe(200m);
        sales.PeriodCredit.ShouldBe(50m);

        result.Lines.Sum(l => l.OpeningDebit).ShouldBe(result.Lines.Sum(l => l.OpeningCredit));
        result.Lines.Sum(l => l.PeriodDebit).ShouldBe(result.Lines.Sum(l => l.PeriodCredit));
        result.OpeningVouchersInPeriod.ShouldBeEmpty();
        result.Lines.Select(l => l.AccountCode).ShouldBe(["1000", "3000", "4000"]);
    }

    [Fact]
    public async Task Handle_Should_ReportOpeningVoucherSeparately_When_DatedInsidePeriod()
    {
        await SeedChartAsync();
        await VoucherSeed.PostedAsync(_db, PeriodFrom, "OB-1", _cash.Id, _capital.Id, 1000m, "opening_balance");
        await VoucherSeed.PostedAsync(_db, PeriodFrom.AddDays(2), "SV-1", _cash.Id, _sales.Id, 75m);

        var result = await Sut().Handle(new GetPeriodTrialBalanceQuery(PeriodFrom, PeriodTo), CancellationToken.None);

        var cash = result.Lines.Single(l => l.AccountCode == "1000");
        cash.OpeningDebit.ShouldBe(0m);
        cash.PeriodDebit.ShouldBe(1075m);
        cash.OpeningVoucherDebit.ShouldBe(1000m);
        result.Lines.Single(l => l.AccountCode == "3000").OpeningVoucherCredit.ShouldBe(1000m);
        result.OpeningVouchersInPeriod.ShouldHaveSingleItem().VoucherNo.ShouldBe("OB-1");
    }

    [Fact]
    public async Task Handle_Should_TreatReversalOfOpeningVoucher_AsOpeningVoucher()
    {
        await SeedChartAsync();
        var ob = await VoucherSeed.PostedAsync(_db, PeriodFrom, "OB-1", _cash.Id, _capital.Id, 1000m, "opening_balance");
        await VoucherSeed.ReverseAsync(_db, ob, "RV-1", PeriodFrom);
        await VoucherSeed.PostedAsync(_db, PeriodFrom, "OB-2", _cash.Id, _capital.Id, 800m, "opening_balance");

        var result = await Sut().Handle(new GetPeriodTrialBalanceQuery(PeriodFrom, PeriodTo), CancellationToken.None);

        var cash = result.Lines.Single(l => l.AccountCode == "1000");
        (cash.OpeningVoucherDebit - cash.OpeningVoucherCredit).ShouldBe(800m);
        (cash.PeriodDebit - cash.PeriodCredit).ShouldBe(800m);
        result.OpeningVouchersInPeriod.Select(v => v.VoucherNo).OrderBy(n => n, StringComparer.Ordinal).ShouldBe(["OB-1", "OB-2", "RV-1"]);
    }

    [Fact]
    public async Task Handle_Should_FilterByBranch()
    {
        await SeedChartAsync();
        var branchA = Guid.CreateVersion7();
        await VoucherSeed.PostedAsync(_db, PeriodFrom.AddDays(1), "SV-A", _cash.Id, _sales.Id, 10m, branchId: branchA);
        await VoucherSeed.PostedAsync(_db, PeriodFrom.AddDays(1), "SV-B", _cash.Id, _sales.Id, 20m, branchId: Guid.CreateVersion7());

        var result = await Sut().Handle(new GetPeriodTrialBalanceQuery(PeriodFrom, PeriodTo, branchA), CancellationToken.None);

        result.BranchId.ShouldBe(branchA);
        result.Lines.Single(l => l.AccountCode == "1000").PeriodDebit.ShouldBe(10m);
    }

    [Fact]
    public async Task Ledger_Should_NetReversedVoucherToZero_And_DropVoidedAndDrafts()
    {
        await SeedChartAsync();
        var sale = await VoucherSeed.PostedAsync(_db, PeriodFrom.AddDays(1), "SV-1", _cash.Id, _sales.Id, 100m);
        await VoucherSeed.ReverseAsync(_db, sale, "RV-1", PeriodFrom.AddDays(2));
        var voided = await VoucherSeed.PostedAsync(_db, PeriodFrom.AddDays(3), "MJ-1", _cash.Id, _sales.Id, 40m, "journal", AccountingVoucherSource.Manual);
        await VoucherSeed.VoidAsync(_db, voided, "duplicate");
        await VoucherSeed.DraftAsync(_db, PeriodFrom.AddDays(4), _cash.Id, _sales.Id, 7m);
        await VoucherSeed.PostedAsync(_db, PeriodFrom.AddDays(5), "SV-2", _cash.Id, _sales.Id, 30m);

        var asOf = await new GetTrialBalanceQueryHandler(_db, _currentBranch)
            .Handle(new GetTrialBalanceQuery(PeriodTo), CancellationToken.None);
        var cashAsOf = asOf.Single(l => l.AccountCode == "1000");
        cashAsOf.NetBalance.ShouldBe(30m);
        cashAsOf.TotalDebit.ShouldBe(130m); // SV-1 + SV-2
        cashAsOf.TotalCredit.ShouldBe(100m); // RV-1

        var period = await Sut().Handle(new GetPeriodTrialBalanceQuery(PeriodFrom, PeriodTo), CancellationToken.None);
        var cash = period.Lines.Single(l => l.AccountCode == "1000");
        (cash.PeriodDebit - cash.PeriodCredit).ShouldBe(30m);
    }

    [Fact]
    public async Task Ledger_Should_KeepOriginal_When_ReversalItselfIsReversed()
    {
        await SeedChartAsync();
        var sale = await VoucherSeed.PostedAsync(_db, PeriodFrom.AddDays(1), "SV-1", _cash.Id, _sales.Id, 100m);
        var reversal = await VoucherSeed.ReverseAsync(_db, sale, "RV-1", PeriodFrom.AddDays(2));
        await VoucherSeed.ReverseAsync(_db, reversal, "RV-2", PeriodFrom.AddDays(3));

        var asOf = await new GetTrialBalanceQueryHandler(_db, _currentBranch)
            .Handle(new GetTrialBalanceQuery(PeriodTo), CancellationToken.None);

        asOf.Single(l => l.AccountCode == "1000").NetBalance.ShouldBe(100m);
    }

    [Fact]
    public void Validator_Should_Reject_ToBeforeFrom()
    {
        var validator = new GetPeriodTrialBalanceQueryValidator();
        validator.Validate(new GetPeriodTrialBalanceQuery(PeriodTo, PeriodFrom)).Errors
            .ShouldContain(e => e.PropertyName == nameof(GetPeriodTrialBalanceQuery.ToUtc));
        validator.Validate(new GetPeriodTrialBalanceQuery(PeriodFrom, PeriodTo)).IsValid.ShouldBeTrue();
    }
}
