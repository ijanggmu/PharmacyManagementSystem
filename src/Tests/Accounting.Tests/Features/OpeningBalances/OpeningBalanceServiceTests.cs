using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.OpeningBalances.SearchOpeningBalanceHistory;
using FSH.Modules.Accounting.Features.v1.Vouchers.ReverseVoucher;
using FSH.Modules.Accounting.Features.v1.Vouchers.VoidVoucher;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace Accounting.Tests.Features.OpeningBalances;

/// <summary>
/// Set / Edit / Reset rules of <see cref="OpeningBalanceService"/> over a real (InMemory)
/// <see cref="AccountingDbContext"/>: the posted voucher is never changed, Edit = reversal + new
/// voucher, Reset = reversal only, every change writes a history row, and the posting lock,
/// stale versions and missing reasons are refused before anything is written.
/// </summary>
public sealed class OpeningBalanceServiceTests : IDisposable
{
    private static readonly DateOnly GoLive = new(2026, 7, 16);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IBranchService _branchService = Substitute.For<IBranchService>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IAccountingVoucherNumbers _numbers = Substitute.For<IAccountingVoucherNumbers>();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly Guid _userId = Guid.CreateVersion7();
    private int _nextNumber;

    private AccountingAccount _cash = default!;
    private AccountingAccount _stock = default!;
    private AccountingAccount _payables = default!;
    private AccountingAccount _equity = default!;
    private AccountingAccount _sales = default!;

    public OpeningBalanceServiceTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(_branchId);
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _branchService.IsActiveBranchOfCurrentTenantAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns(true);
        _currentUser.Name.Returns("owner");
        _currentUser.GetUserId().Returns(_userId);
        _numbers.ReserveNextNumberAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(_ => Task.FromResult(++_nextNumber));
    }

    private OpeningBalanceService Service() =>
        new(_db, _numbers, new AccountingPostingLockService(_db), _currentBranch, _branchService, _currentUser,
            NullLogger<OpeningBalanceService>.Instance);

    private async Task SeedChartAsync()
    {
        _cash = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        // Inventory, AR and AP take their openings from opening stock and customer/supplier openings, so the
        // GL opening screen refuses them; these fixtures use ordinary asset and liability accounts instead.
        _stock = await AccountingTestChart.AddAsync(_db, "1300", AccountingAccountType.Asset);
        _payables = await AccountingTestChart.AddAsync(_db, "2200", AccountingAccountType.Liability);
        _equity = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.OwnersEquity, AccountingAccountType.Equity, isSystem: true);
        _sales = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.SalesRevenue, AccountingAccountType.Revenue, isSystem: true);
    }

    private SetOpeningBalancesCommand SetCommand(Guid? requestId = null, DateOnly? date = null) => new(
        requestId ?? Guid.CreateVersion7(), date ?? GoLive,
        [
            new OpeningBalanceLineInput(_cash.Id, 5000m, 0m),
            new OpeningBalanceLineInput(_stock.Id, 20000m, 0m),
            new OpeningBalanceLineInput(_payables.Id, 0m, 8000m),
        ]);

    private async Task<(OpeningBalanceService Service, OpeningBalanceMutationResultDto Set)> SetUpAsync()
    {
        await SeedChartAsync();
        var service = Service();
        var set = await service.SetAsync(SetCommand());
        _db.ChangeTracker.Clear();
        return (service, set);
    }

    private async Task LockBooksAsync(DateOnly lockDate)
    {
        var lockRow = await new AccountingPostingLockService(_db).GetOrCreateAsync();
        lockRow.SetLockDate(lockDate, "auditor");
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();
    }

    [Fact]
    public async Task Set_Should_PostOneBalancedOpeningVoucher_OnTheOpeningDate_And_RecordHistory()
    {
        await SeedChartAsync();

        var result = await Service().SetAsync(SetCommand());

        var voucher = await _db.Vouchers.Include(v => v.Lines).SingleAsync();
        voucher.Id.ShouldBe(result.PostedVoucherId!.Value);
        voucher.Status.ShouldBe(AccountingVoucherStatus.Posted);
        voucher.VoucherType.ShouldBe(OpeningBalanceRules.VoucherType);
        voucher.Source.ShouldBe(AccountingVoucherSource.System);
        voucher.VoucherNo.ShouldStartWith("OB-");
        voucher.VoucherDateUtc.ShouldBe(new DateTime(2026, 7, 16, 0, 0, 0, DateTimeKind.Utc));
        voucher.ReferenceType.ShouldBe(OpeningBalanceRules.ReferenceType);
        voucher.ReferenceId.ShouldBe(result.HistoryEntryId);
        voucher.BranchId.ShouldBe(_branchId);
        voucher.Lines.Sum(l => l.DebitAmount).ShouldBe(voucher.Lines.Sum(l => l.CreditAmount));
        voucher.Lines.Single(l => l.AccountId == _equity.Id).CreditAmount.ShouldBe(17000m);

        var history = await _db.OpeningBalanceHistory.SingleAsync();
        history.Action.ShouldBe(OpeningBalanceAction.Set);
        history.Sequence.ShouldBe(1);
        history.PerformedByUserId.ShouldBe(_userId);
        history.PerformedByName.ShouldBe("owner");
        history.BranchId.ShouldBe(_branchId);
        history.ReadChanges().Count.ShouldBe(3);

        var state = await Service().GetStateAsync(null);
        state.IsSet.ShouldBeTrue();
        state.Version.ShouldBe(1);
        state.VoucherNo.ShouldBe(voucher.VoucherNo);
        (state.TotalDebit, state.TotalCredit, state.EquityAdjustmentCredit).ShouldBe((25000m, 8000m, 17000m));
        state.Lines.Count.ShouldBe(3);
    }

    [Fact]
    public async Task Set_Should_ReturnTheFirstResult_When_TheSameRequestIsRetried()
    {
        await SeedChartAsync();
        var requestId = Guid.CreateVersion7();

        var first = await Service().SetAsync(SetCommand(requestId));
        _db.ChangeTracker.Clear();
        var retry = await Service().SetAsync(SetCommand(requestId));

        retry.ShouldBe(first);
        (await _db.Vouchers.CountAsync()).ShouldBe(1);
        (await _db.OpeningBalanceHistory.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task Set_Should_Refuse_When_OpeningBalancesAreAlreadySet()
    {
        var (service, _) = await SetUpAsync();

        var ex = await RefusedAsync(() => service.SetAsync(SetCommand()));

        ex.ErrorMessages.ShouldBeEmpty();
        ex.Message.ShouldContain("already set");
        (await _db.Vouchers.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task Set_Should_Refuse_IncomeStatementAccounts()
    {
        await SeedChartAsync();
        var command = new SetOpeningBalancesCommand(Guid.CreateVersion7(), GoLive, [new OpeningBalanceLineInput(_sales.Id, 0m, 100m)]);

        var ex = await RefusedAsync(() => Service().SetAsync(command));

        ex.Message.ShouldContain("asset, liability and equity");
        (await _db.Vouchers.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Set_Should_Refuse_When_TheOpeningDateIsInALockedPeriod()
    {
        await SeedChartAsync();
        await LockBooksAsync(GoLive);

        var ex = await RefusedAsync(() => Service().SetAsync(SetCommand()));

        ex.Message.ShouldContain("locked");
        (await _db.Vouchers.CountAsync()).ShouldBe(0);
        (await _db.OpeningBalanceHistory.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task Edit_Should_ReverseTheCurrentVoucher_And_PostANewOne_WithoutChangingTheOriginal()
    {
        var (service, set) = await SetUpAsync();
        var originalLines = await _db.VoucherLines.AsNoTracking()
            .Where(l => l.VoucherId == set.PostedVoucherId)
            .Select(l => new { l.AccountId, l.DebitAmount, l.CreditAmount })
            .ToListAsync();

        var edit = await service.EditAsync(new EditOpeningBalancesCommand(
            Guid.CreateVersion7(), set.Version, GoLive,
            [
                new OpeningBalanceLineInput(_cash.Id, 5000m, 0m),
                new OpeningBalanceLineInput(_stock.Id, 23500m, 0m),
            ],
            "Stock recount"));

        var original = await _db.Vouchers.Include(v => v.Lines).AsNoTracking().SingleAsync(v => v.Id == set.PostedVoucherId);
        original.Status.ShouldBe(AccountingVoucherStatus.Void);
        original.Lines.Select(l => new { l.AccountId, l.DebitAmount, l.CreditAmount }).ShouldBe(originalLines, ignoreOrder: true);

        var reversal = await _db.Vouchers.Include(v => v.Lines).AsNoTracking().SingleAsync(v => v.Id == edit.ReversalVoucherId);
        reversal.ReversesVoucherId.ShouldBe(set.PostedVoucherId);
        reversal.Status.ShouldBe(AccountingVoucherStatus.Posted);
        reversal.VoucherDateUtc.ShouldBe(original.VoucherDateUtc);
        reversal.Lines.Sum(l => l.DebitAmount).ShouldBe(original.Lines.Sum(l => l.CreditAmount));

        var replacement = await _db.Vouchers.Include(v => v.Lines).AsNoTracking().SingleAsync(v => v.Id == edit.PostedVoucherId);
        replacement.Status.ShouldBe(AccountingVoucherStatus.Posted);
        replacement.Lines.Single(l => l.AccountId == _stock.Id).DebitAmount.ShouldBe(23500m);
        replacement.Lines.Single(l => l.AccountId == _equity.Id).CreditAmount.ShouldBe(28500m);

        edit.ReversedVoucherId.ShouldBe(set.PostedVoucherId);
        edit.Version.ShouldBe(2);

        var history = await _db.OpeningBalanceHistory.AsNoTracking().SingleAsync(h => h.Id == edit.HistoryEntryId);
        history.Action.ShouldBe(OpeningBalanceAction.Edit);
        history.Reason.ShouldBe("Stock recount");
        history.PreviousOpeningDate.ShouldBe(GoLive);
        var changes = history.ReadChanges();
        changes.Select(c => c.AccountId).ShouldBe([_stock.Id, _payables.Id], ignoreOrder: true);
        changes.Single(c => c.AccountId == _payables.Id).AfterCredit.ShouldBe(0m);

        var state = await service.GetStateAsync(null);
        state.VoucherId.ShouldBe(edit.PostedVoucherId);
        state.Lines.Count.ShouldBe(2);
    }

    [Fact]
    public async Task Edit_Should_Refuse_StaleVersion_MissingReason_And_NoChange()
    {
        var (service, set) = await SetUpAsync();
        var same = SetCommand().Lines;

        (await RefusedAsync(() => service.EditAsync(
            new EditOpeningBalancesCommand(Guid.CreateVersion7(), set.Version + 1, GoLive, same, "x"))))
            .Message.ShouldContain("changed by someone else");

        (await RefusedAsync(() => service.EditAsync(
            new EditOpeningBalancesCommand(Guid.CreateVersion7(), set.Version, GoLive, same, " "))))
            .Message.ShouldContain("reason");

        (await RefusedAsync(() => service.EditAsync(
            new EditOpeningBalancesCommand(Guid.CreateVersion7(), set.Version, GoLive, same, "no-op"))))
            .Message.ShouldContain("Nothing changed");

        (await _db.Vouchers.CountAsync()).ShouldBe(1);
        (await _db.OpeningBalanceHistory.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task Edit_Should_Refuse_When_TheCurrentOpeningDateIsLocked()
    {
        var (service, set) = await SetUpAsync();
        await LockBooksAsync(GoLive);

        var ex = await RefusedAsync(() => service.EditAsync(new EditOpeningBalancesCommand(
            Guid.CreateVersion7(), set.Version, GoLive.AddDays(5), [new OpeningBalanceLineInput(_cash.Id, 1m, 0m)], "move date")));

        ex.Message.ShouldContain("current opening date");
        (await _db.Vouchers.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task Reset_Should_OnlyReverse_And_LeaveNoActiveOpening_So_SetWorksAgain()
    {
        var (service, set) = await SetUpAsync();

        var reset = await service.ResetAsync(new ResetOpeningBalancesCommand(Guid.CreateVersion7(), set.Version, "Wrong branch"));

        reset.PostedVoucherId.ShouldBeNull();
        reset.ReversedVoucherId.ShouldBe(set.PostedVoucherId);
        (await _db.Vouchers.CountAsync()).ShouldBe(2);
        (await _db.Vouchers.SingleAsync(v => v.Id == set.PostedVoucherId)).Status.ShouldBe(AccountingVoucherStatus.Void);
        (await _db.Vouchers.SingleAsync(v => v.Id == reset.ReversalVoucherId)).ReversesVoucherId.ShouldBe(set.PostedVoucherId);

        var history = await _db.OpeningBalanceHistory.AsNoTracking().SingleAsync(h => h.Id == reset.HistoryEntryId);
        history.Action.ShouldBe(OpeningBalanceAction.Reset);
        history.OpeningDate.ShouldBeNull();
        history.ReadEntries().ShouldBeEmpty();
        history.ReadChanges().ShouldAllBe(c => c.AfterDebit == 0m && c.AfterCredit == 0m);

        var state = await service.GetStateAsync(null);
        state.IsSet.ShouldBeFalse();
        state.Version.ShouldBe(2);

        _db.ChangeTracker.Clear();
        var again = await service.SetAsync(SetCommand());
        again.Version.ShouldBe(3);
    }

    [Fact]
    public async Task Reset_Should_Refuse_When_NothingIsSet_Or_ThePeriodIsLocked()
    {
        await SeedChartAsync();
        (await RefusedAsync(() => Service().ResetAsync(
            new ResetOpeningBalancesCommand(Guid.CreateVersion7(), 1, "x"))))
            .Message.ShouldContain("no opening balances");

        var service = Service();
        var set = await service.SetAsync(SetCommand());
        _db.ChangeTracker.Clear();
        await LockBooksAsync(GoLive.AddDays(30));

        (await RefusedAsync(() => service.ResetAsync(
            new ResetOpeningBalancesCommand(Guid.CreateVersion7(), set.Version, "x"))))
            .Message.ShouldContain("locked");
        (await _db.Vouchers.SingleAsync()).Status.ShouldBe(AccountingVoucherStatus.Posted);
    }

    [Fact]
    public async Task GenericReverseAndVoid_Should_Refuse_OpeningVouchers()
    {
        var (_, set) = await SetUpAsync();
        var postingService = Substitute.For<IVoucherPostingService>();

        await RefusedAsync(() => new ReverseVoucherCommandHandler(postingService, _currentUser, _db, _currentBranch)
            .Handle(new ReverseVoucherCommand(set.PostedVoucherId!.Value), CancellationToken.None));
        await RefusedAsync(() => new VoidVoucherCommandHandler(postingService, _db, _currentBranch)
            .Handle(new VoidVoucherCommand(set.PostedVoucherId!.Value, "oops"), CancellationToken.None));

        await postingService.DidNotReceiveWithAnyArgs().ReverseAsync(Guid.Empty, default!, default, default);
        await postingService.DidNotReceiveWithAnyArgs().VoidAsync(Guid.Empty, default!, default);
    }

    [Fact]
    public async Task History_Should_ListEveryChange_NewestFirst_WithVoucherNumbers()
    {
        var (service, set) = await SetUpAsync();
        await service.ResetAsync(new ResetOpeningBalancesCommand(Guid.CreateVersion7(), set.Version, "Start over"));

        var page = await new SearchOpeningBalanceHistoryQueryHandler(_db, _currentBranch)
            .Handle(new SearchOpeningBalanceHistoryQuery(), CancellationToken.None);

        page.TotalCount.ShouldBe(2);
        var items = page.Items.ToList();
        items.Select(i => i.Action).ShouldBe(["Reset", "Set"]);
        items[0].ReversedVoucherNo.ShouldStartWith("OB-");
        items[0].ReversalVoucherNo.ShouldStartWith("RV-");
        items[0].Reason.ShouldBe("Start over");
        items[1].PostedVoucherNo.ShouldStartWith("OB-");
        items[1].Changes.Count.ShouldBe(3);
    }

    [Theory]
    [InlineData(AccountingSystemAccountCodes.AccountsReceivable, AccountingAccountType.Asset, "customer")]
    [InlineData(AccountingSystemAccountCodes.AccountsPayable, AccountingAccountType.Liability, "supplier")]
    [InlineData(AccountingSystemAccountCodes.Inventory, AccountingAccountType.Asset, "opening stock")]
    public async Task Set_Should_Refuse_ControlAccountsFedBySubledgerOpenings(string code, AccountingAccountType type, string hint)
    {
        await SeedChartAsync();
        var control = await AccountingTestChart.AddAsync(_db, code, type, isSystem: true);
        bool debit = type == AccountingAccountType.Asset;

        var ex = await RefusedAsync(() => Service().SetAsync(new SetOpeningBalancesCommand(
            Guid.CreateVersion7(), GoLive,
            [
                new OpeningBalanceLineInput(_cash.Id, 5000m, 0m),
                new OpeningBalanceLineInput(control.Id, debit ? 700m : 0m, debit ? 0m : 700m),
            ])));

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.BadRequest);
        ex.Message.ShouldContain(code);
        ex.Message.ShouldContain(hint);
        (await _db.Vouchers.CountAsync()).ShouldBe(0);
        (await _db.OpeningBalanceHistory.CountAsync()).ShouldBe(0);
    }

    private static async Task<CustomException> RefusedAsync<T>(Func<ValueTask<T>> call) =>
        await Should.ThrowAsync<CustomException>(async () => await call());

    public void Dispose() => _db.Dispose();
}
