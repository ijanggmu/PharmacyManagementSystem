using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Inventory.Contracts.Events;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

public sealed class InventoryAdjustedIntegrationEventHandlerTests
{
    private static readonly Guid InventoryAccountId = Guid.CreateVersion7();
    private static readonly Guid CogsAccountId = Guid.CreateVersion7();

    private static (InventoryAdjustedIntegrationEventHandler Handler, IVoucherPostingService Posting) CreateHandler()
    {
        var posting = Substitute.For<IVoucherPostingService>();
        var resolver = Substitute.For<IAccountingAccountResolver>();
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, Arg.Any<CancellationToken>()).Returns(InventoryAccountId);
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.CostOfGoodsSold, Arg.Any<CancellationToken>()).Returns(CogsAccountId);
        return (new InventoryAdjustedIntegrationEventHandler(posting, resolver), posting);
    }

    private static InventoryAdjustedIntegrationEvent Event(decimal valueChange) =>
        new(Guid.NewGuid(), DateTime.UtcNow, "test-tenant", "corr", "Inventory", Guid.CreateVersion7(),
            valueChange, "Batch B1 written off: expired", Guid.CreateVersion7());

    [Fact]
    public async Task HandleAsync_Should_DebitCogsAndCreditInventory_When_StockIsLost()
    {
        var (handler, posting) = CreateHandler();
        var @event = Event(-120m);

        await handler.HandleAsync(@event);

        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.VoucherType == "system_inventory_adjustment"
                && r.ReferenceType == "InventoryAdjustment"
                && r.ReferenceId == @event.AdjustmentId
                && r.BranchId == @event.BranchId
                && r.Lines.Any(l => l.AccountId == CogsAccountId && l.DebitAmount == 120m)
                && r.Lines.Any(l => l.AccountId == InventoryAccountId && l.CreditAmount == 120m)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_DebitInventoryAndCreditCogs_When_StockIsFound()
    {
        var (handler, posting) = CreateHandler();

        await handler.HandleAsync(Event(45m));

        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.Lines.Any(l => l.AccountId == InventoryAccountId && l.DebitAmount == 45m)
                && r.Lines.Any(l => l.AccountId == CogsAccountId && l.CreditAmount == 45m)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_PostNothing_When_ValueUnchanged()
    {
        var (handler, posting) = CreateHandler();

        await handler.HandleAsync(Event(0m));

        await posting.DidNotReceiveWithAnyArgs().PostSystemVoucherAsync(default!, default);
    }
}
