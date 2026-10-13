using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Events;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>A drawer short/over at shift close is booked against Cash Short &amp; Over so GL Cash follows
/// the counted cash: once per shift, on the shift's branch and close date, nothing for a balanced drawer.</summary>
public sealed class CashShiftClosedWithVarianceIntegrationEventHandlerTests : IDisposable
{
    private static readonly DateTime ClosedAt = new(2026, 5, 1, 12, 0, 0, DateTimeKind.Utc);

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly IAccountingVoucherNumbers _numbers = Substitute.For<IAccountingVoucherNumbers>();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private int _next;

    public CashShiftClosedWithVarianceIntegrationEventHandlerTests()
    {
        _numbers.ReserveNextNumberAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(_ => Task.FromResult(++_next));
    }

    public void Dispose() => _db.Dispose();

    private CashShiftClosedWithVarianceIntegrationEventHandler Handler() =>
        new(_db, new VoucherPostingService(
            _db, _numbers, new AccountingPostingLockService(_db), Substitute.For<ICurrentBranch>(), Substitute.For<IBranchService>(),
            NullLogger<VoucherPostingService>.Instance));

    private CashShiftClosedWithVarianceIntegrationEvent Event(decimal expected, decimal counted, Guid? shiftId = null) =>
        new(Guid.NewGuid(), ClosedAt.AddMinutes(5), "test-tenant", "corr", "Sales", shiftId ?? Guid.CreateVersion7(), _branchId,
            ClosedAt.AddHours(-8), ClosedAt, "cashier", expected, counted, counted - expected);

    private async Task<(Guid Cash, Guid ShortOver)> ChartAsync()
    {
        var cash = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        var shortOver = await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.CashShortAndOver, AccountingAccountType.Expense, isSystem: true);
        return (cash.Id, shortOver.Id);
    }

    private Task<AccountingVoucher> SingleVoucherAsync() =>
        _db.Vouchers.Include(v => v.Lines).SingleAsync();

    [Fact]
    public async Task Short_Should_DebitShortAndOver_And_CreditCash()
    {
        var (cash, shortOver) = await ChartAsync();
        var @event = Event(expected: 1250m, counted: 1230.50m);

        await Handler().HandleAsync(@event);

        var voucher = await SingleVoucherAsync();
        voucher.VoucherType.ShouldBe(CashShiftClosedWithVarianceIntegrationEventHandler.VoucherType);
        voucher.ReferenceId.ShouldBe(@event.CashShiftId);
        voucher.BranchId.ShouldBe(_branchId);
        voucher.VoucherDateUtc.ShouldBe(ClosedAt);
        voucher.Lines.Count.ShouldBe(2);
        voucher.Lines.ShouldContain(l => l.AccountId == shortOver && l.DebitAmount == 19.50m && l.CreditAmount == 0m);
        voucher.Lines.ShouldContain(l => l.AccountId == cash && l.CreditAmount == 19.50m && l.DebitAmount == 0m);
    }

    [Fact]
    public async Task Over_Should_DebitCash_And_CreditShortAndOver()
    {
        var (cash, shortOver) = await ChartAsync();

        await Handler().HandleAsync(Event(expected: 1250m, counted: 1260m));

        var voucher = await SingleVoucherAsync();
        voucher.Lines.ShouldContain(l => l.AccountId == cash && l.DebitAmount == 10m);
        voucher.Lines.ShouldContain(l => l.AccountId == shortOver && l.CreditAmount == 10m);
    }

    [Fact]
    public async Task Redelivery_Should_PostOnlyOnce()
    {
        await ChartAsync();
        var @event = Event(expected: 500m, counted: 480m);

        await Handler().HandleAsync(@event);
        await Handler().HandleAsync(@event with { Id = Guid.NewGuid() });

        (await _db.Vouchers.CountAsync()).ShouldBe(1);
    }

    [Fact]
    public async Task BalancedDrawer_Should_PostNothing()
    {
        await ChartAsync();

        await Handler().HandleAsync(Event(expected: 500m, counted: 500m));

        (await _db.Vouchers.AnyAsync()).ShouldBeFalse();
    }

    [Fact]
    public async Task MissingShortAndOverAccount_Should_BeCreatedAsSystemExpense()
    {
        await AccountingTestChart.AddAsync(_db, AccountingSystemAccountCodes.Cash, AccountingAccountType.Asset, isSystem: true);
        var expenseRoot = await AccountingTestChart.RootAsync(_db, AccountingAccountType.Expense);

        await Handler().HandleAsync(Event(expected: 500m, counted: 490m));

        var account = await _db.Accounts.SingleAsync(a => a.Code == AccountingSystemAccountCodes.CashShortAndOver);
        account.IsSystem.ShouldBeTrue();
        account.AccountType.ShouldBe(AccountingAccountType.Expense);
        account.ParentId.ShouldBe(expenseRoot.Id);
        (await SingleVoucherAsync()).Lines.ShouldContain(l => l.AccountId == account.Id && l.DebitAmount == 10m);
    }
}
