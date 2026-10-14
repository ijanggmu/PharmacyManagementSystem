using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Reports.GetBalanceSheet;
using FSH.Modules.Accounting.Features.v1.Reports.GetPeriodTrialBalance;
using FSH.Modules.Accounting.Features.v1.Reports.GetProfitAndLoss;
using FSH.Modules.Accounting.Features.v1.Reports.GetTrialBalance;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace Accounting.Tests.Features.FiscalYears;

/// <summary>
/// <see cref="FiscalYearCloseService"/> (close / reopen / list) and how the reports treat its closing vouchers: the
/// P&amp;L of a closed year keeps its real figures, while the as-of reports (balance sheet, trial balance) include the
/// close, so revenue and expense read zero and the profit sits in Retained Earnings.
/// FY 2081/82 = 2024-07-16 … 2025-07-16, FY 2082/83 = 2025-07-17 … 2026-07-16; "today" is 2026-10-13.
/// </summary>
public sealed class FiscalYearCloseServiceTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 10, 13, 6, 0, 0, DateTimeKind.Utc);
    private static readonly DateOnly Fy2082End = new(2026, 7, 16);
    private static readonly DateTime InFy2081 = new(2025, 1, 10, 6, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime InFy2082 = new(2025, 12, 1, 6, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime InFy2083 = new(2026, 9, 1, 6, 0, 0, DateTimeKind.Utc);
    private static readonly Guid BranchA = Guid.NewGuid();
    private static readonly Guid BranchB = Guid.NewGuid();

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private AccountingAccount _cash = default!;
    private AccountingAccount _capital = default!;
    private AccountingAccount _retained = default!;
    private AccountingAccount _sales = default!;
    private AccountingAccount _cogs = default!;
    private int _voucherNo;

    public FiscalYearCloseServiceTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.ArgAt<Guid?>(0));
    }

    public void Dispose() => _db.Dispose();

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(utcNow, TimeSpan.Zero);
    }

    private FiscalYearCloseService Sut()
    {
        int next = 100;
        var numbers = Substitute.For<IAccountingVoucherNumbers>();
        numbers.ReserveNextNumberAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(_ => Task.FromResult(++next));
        return new FiscalYearCloseService(
            _db, numbers, new AccountingPostingLockService(_db), new FixedTimeProvider(Now), NullLogger<FiscalYearCloseService>.Instance);
    }

    private async Task SeedChartAsync(bool withRetainedEarnings = true)
    {
        _cash = await AccountingTestChart.AddAsync(_db, "1000", AccountingAccountType.Asset, isSystem: true);
        _capital = await AccountingTestChart.AddAsync(_db, "3000", AccountingAccountType.Equity, isSystem: true);
        if (withRetainedEarnings)
        {
            _retained = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.RetainedEarnings, AccountingAccountType.Equity, isSystem: true);
        }

        _sales = await AccountingTestChart.AddAsync(_db, "4000", AccountingAccountType.Revenue, isSystem: true);
        _cogs = await AccountingTestChart.AddAsync(_db, "5000", AccountingAccountType.Expense, isSystem: true);
    }

    private Task<AccountingVoucher> SaleAsync(DateTime date, decimal amount, Guid? branch = null) =>
        VoucherSeed.PostedAsync(_db, date, $"SAL-{++_voucherNo}", _cash.Id, _sales.Id, amount, branchId: branch ?? BranchA);

    private Task<AccountingVoucher> CostAsync(DateTime date, decimal amount, Guid? branch = null) =>
        VoucherSeed.PostedAsync(_db, date, $"PMT-{++_voucherNo}", _cogs.Id, _cash.Id, amount, "system_expense", branchId: branch ?? BranchA);

    private static DateTime EndOfDayUtc(DateOnly day) => NepalDate.EndExclusiveUtc(day).AddMilliseconds(-1);

    #region Close — happy path

    [Fact]
    public async Task CloseAsync_Should_ZeroRevenueAndExpense_IntoRetainedEarnings_And_LockTheYear()
    {
        await SeedChartAsync();
        await VoucherSeed.PostedAsync(_db, InFy2082.AddDays(-30), "OB-1", _cash.Id, _capital.Id, 500m, "opening_balance", branchId: BranchA);
        await SaleAsync(InFy2082, 1000m);
        await CostAsync(InFy2082.AddDays(5), 600m);
        await SaleAsync(InFy2083, 70m); // next year — not part of the close

        var result = await Sut().CloseAsync(2082, "accountant");

        result.Label.ShouldBe("2082/83");
        result.NetProfit.ShouldBe(400m);
        result.ClosingVoucherIds.Count.ShouldBe(1);
        result.LockDate.ShouldBe(Fy2082End);

        var voucher = await _db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.VoucherType == FiscalYearCloseRules.VoucherType);
        voucher.Status.ShouldBe(AccountingVoucherStatus.Posted);
        voucher.Source.ShouldBe(AccountingVoucherSource.System);
        voucher.VoucherNo.ShouldStartWith("JV-");
        voucher.BranchId.ShouldBe(BranchA);
        NepalDate.FromUtc(voucher.VoucherDateUtc).ShouldBe(Fy2082End);
        voucher.VoucherDateUtc.ShouldBe(EndOfDayUtc(Fy2082End));
        voucher.Lines.Single(l => l.AccountId == _sales.Id).DebitAmount.ShouldBe(1000m);
        voucher.Lines.Single(l => l.AccountId == _cogs.Id).CreditAmount.ShouldBe(600m);
        voucher.Lines.Single(l => l.AccountId == _retained.Id).CreditAmount.ShouldBe(400m);

        var close = await _db.FiscalYearCloses.SingleAsync();
        close.FiscalYear.ShouldBe(2082);
        close.ClosedBy.ShouldBe("accountant");
        close.VoucherCount.ShouldBe(1);
        (await _db.PostingLocks.SingleAsync()).LockDate.ShouldBe(Fy2082End);
    }

    [Fact]
    public async Task Reports_Should_KeepTheClosedYearsProfit_But_ShowItInRetainedEarnings()
    {
        await SeedChartAsync();
        await SaleAsync(InFy2082, 1000m);
        await CostAsync(InFy2082.AddDays(5), 600m);
        await SaleAsync(InFy2083, 70m);
        await Sut().CloseAsync(2082, "accountant");

        DateTime fyStart = NepalDate.StartUtc(new DateOnly(2025, 7, 17));
        DateTime fyEnd = EndOfDayUtc(Fy2082End);

        // P&L for the closed year: real figures, the closing voucher left out.
        var pl = await new GetProfitAndLossQueryHandler(_db, _currentBranch)
            .Handle(new GetProfitAndLossQuery(fyStart, fyEnd), CancellationToken.None);
        pl.TotalRevenue.ShouldBe(1000m);
        pl.TotalExpense.ShouldBe(600m);
        pl.NetIncome.ShouldBe(400m);

        // Balance sheet at the year end: nothing unclosed, the profit is retained earnings.
        var atYearEnd = await new GetBalanceSheetQueryHandler(_db, _currentBranch)
            .Handle(new GetBalanceSheetQuery(fyEnd), CancellationToken.None);
        atYearEnd.CurrentEarnings.ShouldBe(0m);
        atYearEnd.RetainedEarnings.ShouldBe(400m);
        atYearEnd.Equity.Lines.Single(l => l.AccountCode == AccountingSystemAccountCodes.RetainedEarnings).NetBalance.ShouldBe(400m);
        atYearEnd.IsBalanced.ShouldBeTrue();

        // Balance sheet now: next year's sale is current year earnings.
        var now = await new GetBalanceSheetQueryHandler(_db, _currentBranch)
            .Handle(new GetBalanceSheetQuery(Now), CancellationToken.None);
        now.CurrentEarnings.ShouldBe(70m);
        now.RetainedEarnings.ShouldBe(400m);
        now.IsBalanced.ShouldBeTrue();

        // As-of trial balance includes the close: revenue and expense read zero at the year end.
        var tb = await new GetTrialBalanceQueryHandler(_db, _currentBranch)
            .Handle(new GetTrialBalanceQuery(fyEnd), CancellationToken.None);
        tb.Single(l => l.AccountCode == "4000").NetBalance.ShouldBe(0m);
        tb.Single(l => l.AccountCode == "5000").NetBalance.ShouldBe(0m);

        // Period trial balance: the close is in the movement (closing = as-of) and reported separately.
        var period = await new GetPeriodTrialBalanceQueryHandler(_db, _currentBranch)
            .Handle(new GetPeriodTrialBalanceQuery(fyStart, fyEnd), CancellationToken.None);
        var sales = period.Lines.Single(l => l.AccountCode == "4000");
        sales.PeriodDebit.ShouldBe(1000m);
        sales.PeriodCredit.ShouldBe(1000m);
        sales.YearEndCloseVoucherDebit.ShouldBe(1000m);
        sales.YearEndCloseVoucherCredit.ShouldBe(0m);
        period.Lines.Single(l => l.AccountCode == "3900").YearEndCloseVoucherCredit.ShouldBe(400m);
        period.Lines.Single(l => l.AccountCode == "1000").YearEndCloseVoucherDebit.ShouldBe(0m);
    }

    [Fact]
    public async Task CloseAsync_Should_PostOneVoucherPerBranch_So_PerBranchReportsStayCorrect()
    {
        await SeedChartAsync();
        await SaleAsync(InFy2082, 1000m, BranchA);
        await CostAsync(InFy2082, 600m, BranchA);
        await SaleAsync(InFy2082, 300m, BranchB);
        await CostAsync(InFy2082, 450m, BranchB); // branch B made a loss

        var result = await Sut().CloseAsync(2082, "accountant");

        result.NetProfit.ShouldBe(250m);
        result.ClosingVoucherIds.Count.ShouldBe(2);
        var vouchers = await _db.Vouchers.Include(v => v.Lines)
            .Where(v => v.VoucherType == FiscalYearCloseRules.VoucherType).ToListAsync();
        vouchers.Select(v => v.BranchId).ShouldBe([BranchA, BranchB], ignoreOrder: true);
        vouchers.Single(v => v.BranchId == BranchB).Lines.Single(l => l.AccountId == _retained.Id).DebitAmount.ShouldBe(150m);

        var handler = new GetBalanceSheetQueryHandler(_db, _currentBranch);
        var a = await handler.Handle(new GetBalanceSheetQuery(Now, BranchA), CancellationToken.None);
        var b = await handler.Handle(new GetBalanceSheetQuery(Now, BranchB), CancellationToken.None);
        a.RetainedEarnings.ShouldBe(400m);
        a.CurrentEarnings.ShouldBe(0m);
        a.IsBalanced.ShouldBeTrue();
        b.RetainedEarnings.ShouldBe(-150m);
        b.CurrentEarnings.ShouldBe(0m);
        b.IsBalanced.ShouldBeTrue();
    }

    [Fact]
    public async Task CloseAsync_Should_RecordTheClose_WithoutVouchers_When_TheYearHasNoRevenueOrExpense()
    {
        await SeedChartAsync();
        await VoucherSeed.PostedAsync(_db, InFy2082, "OB-1", _cash.Id, _capital.Id, 500m, "opening_balance", branchId: BranchA);

        var result = await Sut().CloseAsync(2082, "accountant");

        result.ClosingVoucherIds.ShouldBeEmpty();
        result.NetProfit.ShouldBe(0m);
        (await _db.FiscalYearCloses.SingleAsync()).VoucherCount.ShouldBe(0);
        result.LockDate.ShouldBe(Fy2082End);
    }

    [Fact]
    public async Task CloseAsync_Should_KeepALaterLockDate()
    {
        await SeedChartAsync();
        await SaleAsync(InFy2082, 100m);
        var lockRow = await new AccountingPostingLockService(_db).GetOrCreateAsync();
        lockRow.SetLockDate(new DateOnly(2026, 9, 30), "someone");
        await _db.SaveChangesAsync();

        var result = await Sut().CloseAsync(2082, "accountant");

        result.LockDate.ShouldBe(new DateOnly(2026, 9, 30));
        result.ClosingVoucherIds.Count.ShouldBe(1); // the close posts into the already locked period
    }

    [Fact]
    public async Task CloseAsync_Should_CreateRetainedEarnings_When_TheSeedHasNotRun()
    {
        await SeedChartAsync(withRetainedEarnings: false);
        await SaleAsync(InFy2082, 100m);

        await Sut().CloseAsync(2082, "accountant");

        var retained = await _db.Accounts.SingleAsync(a => a.Code == AccountingSystemAccountCodes.RetainedEarnings);
        retained.IsSystem.ShouldBeTrue();
        retained.AccountType.ShouldBe(AccountingAccountType.Equity);
        retained.ParentId.ShouldBe((await _db.Accounts.SingleAsync(a => a.Code == "3")).Id);
    }

    [Fact]
    public async Task CloseAsync_Should_CloseInOrder_When_EarlierYearIsClosedFirst()
    {
        await SeedChartAsync();
        await SaleAsync(InFy2081, 200m);
        await SaleAsync(InFy2082, 1000m);

        var first = await Sut().CloseAsync(2081, "accountant");
        var second = await Sut().CloseAsync(2082, "accountant");

        first.NetProfit.ShouldBe(200m);
        second.NetProfit.ShouldBe(1000m); // only FY 2082's own profit: FY 2081's was already zeroed
        var bs = await new GetBalanceSheetQueryHandler(_db, _currentBranch)
            .Handle(new GetBalanceSheetQuery(Now), CancellationToken.None);
        bs.RetainedEarnings.ShouldBe(1200m);
        bs.CurrentEarnings.ShouldBe(0m);
    }

    #endregion

    #region Close — refusals

    [Fact]
    public async Task CloseAsync_Should_Refuse_When_TheYearHasNotEnded()
    {
        await SeedChartAsync();
        await SaleAsync(InFy2083, 100m);

        var ex = await Should.ThrowAsync<CustomException>(() => Sut().CloseAsync(2083, "accountant"));

        ex.Message.ShouldContain("has not ended");
        (await _db.FiscalYearCloses.AnyAsync()).ShouldBeFalse();
    }

    [Fact]
    public async Task CloseAsync_Should_Refuse_When_AlreadyClosed_And_PostNothingTwice()
    {
        await SeedChartAsync();
        await SaleAsync(InFy2082, 100m);
        await Sut().CloseAsync(2082, "accountant");

        var ex = await Should.ThrowAsync<CustomException>(() => Sut().CloseAsync(2082, "accountant"));

        ex.Message.ShouldContain("already closed");
        (await _db.Vouchers.CountAsync(v => v.VoucherType == FiscalYearCloseRules.VoucherType)).ShouldBe(1);
    }

    [Fact]
    public async Task CloseAsync_Should_Refuse_When_AnEarlierYearWithActivityIsOpen()
    {
        await SeedChartAsync();
        await SaleAsync(InFy2081, 200m);
        await SaleAsync(InFy2082, 1000m);

        var ex = await Should.ThrowAsync<CustomException>(() => Sut().CloseAsync(2082, "accountant"));

        ex.Message.ShouldContain("2081/82");
        (await _db.Vouchers.AnyAsync(v => v.VoucherType == FiscalYearCloseRules.VoucherType)).ShouldBeFalse();
        (await _db.FiscalYearCloses.AnyAsync()).ShouldBeFalse();
    }

    [Fact]
    public async Task CloseAsync_Should_Refuse_When_RetainedEarningsCodeIsTakenByAUserAccount()
    {
        await SeedChartAsync(withRetainedEarnings: false);
        await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.RetainedEarnings, AccountingAccountType.Equity);
        await SaleAsync(InFy2082, 100m);

        var ex = await Should.ThrowAsync<CustomException>(() => Sut().CloseAsync(2082, "accountant"));

        ex.Message.ShouldContain(AccountingSystemAccountCodes.RetainedEarnings);
    }

    #endregion

    #region Reopen and list

    [Fact]
    public async Task ReopenAsync_Should_ReverseTheClosingVouchers_And_DeleteTheClose_LeavingTheLock()
    {
        await SeedChartAsync();
        await SaleAsync(InFy2082, 1000m);
        await CostAsync(InFy2082, 600m);
        await Sut().CloseAsync(2082, "accountant");

        var result = await Sut().ReopenAsync(2082, "accountant");

        result.ReversalVoucherIds.Count.ShouldBe(1);
        result.LockDate.ShouldBe(Fy2082End);
        (await _db.FiscalYearCloses.AnyAsync()).ShouldBeFalse();
        var reversal = await _db.Vouchers.SingleAsync(v => v.Id == result.ReversalVoucherIds[0]);
        reversal.VoucherNo.ShouldStartWith("RV-");
        reversal.VoucherDateUtc.ShouldBe(EndOfDayUtc(Fy2082End));

        var bs = await new GetBalanceSheetQueryHandler(_db, _currentBranch)
            .Handle(new GetBalanceSheetQuery(Now), CancellationToken.None);
        bs.RetainedEarnings.ShouldBe(0m);
        bs.CurrentEarnings.ShouldBe(400m);
        bs.IsBalanced.ShouldBeTrue();

        var pl = await new GetProfitAndLossQueryHandler(_db, _currentBranch)
            .Handle(new GetProfitAndLossQuery(NepalDate.StartUtc(new DateOnly(2025, 7, 17)), EndOfDayUtc(Fy2082End)), CancellationToken.None);
        pl.NetIncome.ShouldBe(400m); // neither the close nor its reversal is in the P&L

        // And it can be closed again.
        var again = await Sut().CloseAsync(2082, "accountant");
        again.NetProfit.ShouldBe(400m);
    }

    [Fact]
    public async Task ReopenAsync_Should_Refuse_When_ALaterYearIsClosed()
    {
        await SeedChartAsync();
        await SaleAsync(InFy2081, 200m);
        await SaleAsync(InFy2082, 1000m);
        await Sut().CloseAsync(2081, "accountant");
        await Sut().CloseAsync(2082, "accountant");

        var ex = await Should.ThrowAsync<CustomException>(() => Sut().ReopenAsync(2081, "accountant"));

        ex.Message.ShouldContain("2082/83");
    }

    [Fact]
    public async Task ReopenAsync_Should_Throw_NotFound_When_TheYearIsNotClosed()
    {
        await SeedChartAsync();

        await Should.ThrowAsync<NotFoundException>(() => Sut().ReopenAsync(2082, "accountant"));
    }

    [Fact]
    public async Task ListAsync_Should_ListYearsFromFirstActivity_NewestFirst_WithCloseStatus()
    {
        await SeedChartAsync();
        await SaleAsync(InFy2081, 200m);
        await Sut().CloseAsync(2081, "accountant");

        var years = await Sut().ListAsync();

        years.Select(y => y.FiscalYear).ShouldBe([2083, 2082, 2081]);
        years[0].HasEnded.ShouldBeFalse();
        years[1].HasEnded.ShouldBeTrue();
        years[1].IsClosed.ShouldBeFalse();
        years[2].IsClosed.ShouldBeTrue();
        years[2].ClosedBy.ShouldBe("accountant");
        years[2].NetProfit.ShouldBe(200m);
        years[2].ClosingVoucherNos.Count.ShouldBe(1);
        years[2].StartDate.ShouldBe(new DateOnly(2024, 7, 16));
        years[2].EndDate.ShouldBe(new DateOnly(2025, 7, 16));
    }

    #endregion

    #region A closed year stays closed

    [Fact]
    public async Task CloseAsync_Should_RecordTheLockMove_InTheLockHistory()
    {
        await SeedChartAsync();
        await SaleAsync(InFy2082, 100m);

        await Sut().CloseAsync(2082, "accountant");

        var change = await _db.PostingLockChanges.SingleAsync();
        (change.FromLockDate, change.ToLockDate, change.ChangedBy).ShouldBe(((DateOnly?)null, (DateOnly?)Fy2082End, "accountant"));
    }

    [Fact]
    public async Task SetPostingLock_Should_Refuse_MovingTheLockBeforeAClosedYearsEnd_Or_ClearingIt()
    {
        await SeedChartAsync();
        await SaleAsync(InFy2082, 100m);
        await Sut().CloseAsync(2082, "accountant");
        var currentUser = Substitute.For<FSH.Framework.Core.Context.ICurrentUser>();
        currentUser.Name.Returns("owner");
        var handler = new FSH.Modules.Accounting.Features.v1.PostingLock.SetPostingLock.SetPostingLockCommandHandler(
            _db, new AccountingPostingLockService(_db), currentUser);

        Task<FSH.Modules.Accounting.Contracts.Dtos.PostingLockDto> SetAsync(DateOnly? lockDate) =>
            handler.Handle(new FSH.Modules.Accounting.Contracts.v1.PostingLock.SetPostingLockCommand(lockDate), CancellationToken.None).AsTask();

        var back = await Should.ThrowAsync<CustomException>(() => SetAsync(new DateOnly(2026, 7, 1)));
        back.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        await Should.ThrowAsync<CustomException>(() => SetAsync(null));

        var later = await SetAsync(new DateOnly(2026, 8, 31));
        later.LockDate.ShouldBe(new DateOnly(2026, 8, 31));
    }

    [Fact]
    public async Task AssertPostingOpen_Should_Refuse_ADateInAClosedYear_Even_When_TheLockRowWasCleared()
    {
        await SeedChartAsync();
        await SaleAsync(InFy2082, 100m);
        await Sut().CloseAsync(2082, "accountant");
        var lockService = new AccountingPostingLockService(_db);
        (await lockService.GetOrCreateAsync()).SetLockDate(null, "legacy");
        await _db.SaveChangesAsync();

        var ex = await Should.ThrowAsync<CustomException>(() => lockService.AssertPostingOpenAsync(new DateTime(2026, 7, 12, 6, 0, 0, DateTimeKind.Utc)));
        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        (await lockService.IsOpenAsync(new DateTime(2026, 7, 12, 6, 0, 0, DateTimeKind.Utc))).ShouldBeFalse();
        (await lockService.IsOpenAsync(InFy2083)).ShouldBeTrue();
        await lockService.AssertPostingOpenAsync(InFy2083);
    }

    #endregion
}
