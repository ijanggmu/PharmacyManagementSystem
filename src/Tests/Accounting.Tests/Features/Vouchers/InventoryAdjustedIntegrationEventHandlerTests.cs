using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Inventory.Contracts.Events;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>Stock write-offs and count differences post to Stock Write-off &amp; Expiry Loss (5015), not Cost of Goods Sold.</summary>
public sealed class InventoryAdjustedIntegrationEventHandlerTests : IDisposable
{
    private static readonly Guid InventoryAccountId = Guid.CreateVersion7();
    private static readonly Guid CogsAccountId = Guid.CreateVersion7();

    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly IVoucherPostingService _posting = Substitute.For<IVoucherPostingService>();

    public void Dispose() => _db.Dispose();

    private InventoryAdjustedIntegrationEventHandler CreateHandler()
    {
        var resolver = Substitute.For<IAccountingAccountResolver>();
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, Arg.Any<CancellationToken>()).Returns(InventoryAccountId);
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.CostOfGoodsSold, Arg.Any<CancellationToken>()).Returns(CogsAccountId);
        return new InventoryAdjustedIntegrationEventHandler(_posting, resolver, _db);
    }

    private static InventoryAdjustedIntegrationEvent Event(decimal valueChange) =>
        new(Guid.NewGuid(), DateTime.UtcNow, "test-tenant", "corr", "Inventory", Guid.CreateVersion7(),
            valueChange, "Batch B1 written off: expired", Guid.CreateVersion7());

    private Task<AccountingAccount> WriteOffAccountAsync() =>
        _db.Accounts.SingleAsync(a => a.Code == AccountingSystemAccountCodes.StockWriteOff);

    [Fact]
    public async Task HandleAsync_Should_DebitStockWriteOffAndCreditInventory_When_StockIsLost()
    {
        var handler = CreateHandler();
        var @event = Event(-120m);

        await handler.HandleAsync(@event);

        var writeOff = await WriteOffAccountAsync();
        writeOff.IsSystem.ShouldBeTrue("created on first use for a tenant whose seed has not run");
        writeOff.AccountType.ShouldBe(AccountingAccountType.Expense);
        await _posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.VoucherType == "system_inventory_adjustment"
                && r.ReferenceType == "InventoryAdjustment"
                && r.ReferenceId == @event.AdjustmentId
                && r.BranchId == @event.BranchId
                && r.Lines.Any(l => l.AccountId == writeOff.Id && l.DebitAmount == 120m)
                && r.Lines.Any(l => l.AccountId == InventoryAccountId && l.CreditAmount == 120m)
                && r.Lines.All(l => l.AccountId != CogsAccountId)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_DebitInventoryAndCreditStockWriteOff_When_StockIsFound()
    {
        var existing = AccountingAccount.Create(
            AccountingSystemAccountCodes.StockWriteOff, "Stock Write-off & Expiry Loss", AccountingAccountType.Expense, isSystem: true);
        _db.Accounts.Add(existing);
        await _db.SaveChangesAsync();

        await CreateHandler().HandleAsync(Event(45m));

        (await _db.Accounts.CountAsync()).ShouldBe(1, "the seeded account is reused");
        await _posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.Lines.Any(l => l.AccountId == InventoryAccountId && l.DebitAmount == 45m)
                && r.Lines.Any(l => l.AccountId == existing.Id && l.CreditAmount == 45m)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_PostNothing_When_ValueUnchanged()
    {
        await CreateHandler().HandleAsync(Event(0m));

        await _posting.DidNotReceiveWithAnyArgs().PostSystemVoucherAsync(default!, default);
    }
}
