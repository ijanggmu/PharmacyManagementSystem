using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Inventory.Contracts.Events;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

public sealed class StockTransferReceivedIntegrationEventHandlerTests
{
    private static readonly Guid InventoryAccountId = Guid.CreateVersion7();
    private static readonly Guid EquityAccountId = Guid.CreateVersion7();

    private static (StockTransferReceivedIntegrationEventHandler Handler, IVoucherPostingService Posting) CreateHandler()
    {
        var posting = Substitute.For<IVoucherPostingService>();
        posting.FindPostedVoucherIdAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns((Guid?)null);
        var resolver = Substitute.For<IAccountingAccountResolver>();
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, Arg.Any<CancellationToken>()).Returns(InventoryAccountId);
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, Arg.Any<CancellationToken>()).Returns(EquityAccountId);
        return (new StockTransferReceivedIntegrationEventHandler(posting, resolver), posting);
    }

    private static StockTransferReceivedIntegrationEvent Event(decimal totalCost) =>
        new(Guid.NewGuid(), DateTime.UtcNow, "test-tenant", "corr", "Inventory", Guid.CreateVersion7(), "TRF-1",
            Guid.CreateVersion7(), Guid.CreateVersion7(), totalCost,
            [new StockTransferReceivedLine(Guid.CreateVersion7(), "B1", 10m, totalCost / 10m)], DateTime.UtcNow);

    [Fact]
    public async Task HandleAsync_Should_Credit_Inventory_At_Source_And_Debit_It_At_Destination()
    {
        var (handler, posting) = CreateHandler();
        var @event = Event(250m);

        await handler.HandleAsync(@event);

        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.ReferenceType == StockTransferReceivedIntegrationEventHandler.OutReferenceType
                && r.ReferenceId == @event.StockTransferId
                && r.BranchId == @event.FromBranchId
                && r.Lines.Any(l => l.AccountId == InventoryAccountId && l.CreditAmount == 250m)
                && r.Lines.Any(l => l.AccountId == EquityAccountId && l.DebitAmount == 250m)),
            Arg.Any<CancellationToken>());
        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.ReferenceType == StockTransferReceivedIntegrationEventHandler.InReferenceType
                && r.ReferenceId == @event.StockTransferId
                && r.BranchId == @event.ToBranchId
                && r.Lines.Any(l => l.AccountId == InventoryAccountId && l.DebitAmount == 250m)
                && r.Lines.Any(l => l.AccountId == EquityAccountId && l.CreditAmount == 250m)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_Post_Only_The_Missing_Leg_On_Redelivery()
    {
        var (handler, posting) = CreateHandler();
        var @event = Event(100m);
        posting.FindPostedVoucherIdAsync(
                StockTransferReceivedIntegrationEventHandler.OutReferenceType, @event.StockTransferId, Arg.Any<CancellationToken>())
            .Returns(Guid.CreateVersion7());

        await handler.HandleAsync(@event);

        await posting.Received(1).PostSystemVoucherAsync(Arg.Any<PostVoucherRequest>(), Arg.Any<CancellationToken>());
        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r => r.ReferenceType == StockTransferReceivedIntegrationEventHandler.InReferenceType),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_Post_Nothing_For_Zero_Cost()
    {
        var (handler, posting) = CreateHandler();

        await handler.HandleAsync(Event(0m));

        await posting.DidNotReceiveWithAnyArgs().PostSystemVoucherAsync(default!, default);
    }
}
