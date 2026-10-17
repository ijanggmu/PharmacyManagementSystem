using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Inventory.Contracts.Events;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

public sealed class ConsignmentSettledIntegrationEventHandlerTests
{
    private static readonly Guid PayableId = Guid.CreateVersion7();
    private static readonly Guid InventoryId = Guid.CreateVersion7();
    private static readonly Guid InputVatId = Guid.CreateVersion7();

    private static (ConsignmentSettledIntegrationEventHandler Handler, IVoucherPostingService Posting) CreateHandler()
    {
        var posting = Substitute.For<IVoucherPostingService>();
        var resolver = Substitute.For<IAccountingAccountResolver>();
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, Arg.Any<CancellationToken>()).Returns(PayableId);
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, Arg.Any<CancellationToken>()).Returns(InventoryId);
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.InputVatRecoverable, Arg.Any<CancellationToken>()).Returns(InputVatId);
        return (new ConsignmentSettledIntegrationEventHandler(
            posting, resolver, Substitute.For<Mediator.IMediator>(), NullLogger<ConsignmentSettledIntegrationEventHandler>.Instance), posting);
    }

    private static ConsignmentSettledIntegrationEvent Event(decimal totalAmount, decimal vatAmount = 0m, Guid? branchId = null) =>
        new(Guid.NewGuid(), DateTime.UtcNow, "test-tenant", "corr", "Inventory", Guid.CreateVersion7(),
            Guid.CreateVersion7(), totalAmount, DateTime.UtcNow, branchId, vatAmount);

    [Fact]
    public async Task HandleAsync_Should_DebitInventoryAndInputVat_AndCreditGrossPayable()
    {
        var (handler, posting) = CreateHandler();
        var branchId = Guid.CreateVersion7();
        var @event = Event(100m, 13m, branchId);

        await handler.HandleAsync(@event);

        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.VoucherType == "system_consignment_settlement"
                && r.ReferenceType == "ConsignmentSettlement"
                && r.ReferenceId == @event.SettlementId
                && r.BranchId == branchId
                && r.Lines.Count == 3
                && r.Lines.Any(l => l.AccountId == InventoryId && l.DebitAmount == 100m)
                && r.Lines.Any(l => l.AccountId == InputVatId && l.DebitAmount == 13m)
                && r.Lines.Any(l => l.AccountId == PayableId && l.CreditAmount == 113m)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_PostNetOnly_WhenTheSettlementCarriesNoVat()
    {
        var (handler, posting) = CreateHandler();

        await handler.HandleAsync(Event(250m));

        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.Lines.Count == 2
                && r.Lines.Any(l => l.AccountId == InventoryId && l.DebitAmount == 250m)
                && r.Lines.Any(l => l.AccountId == PayableId && l.CreditAmount == 250m)
                && r.Lines.All(l => l.AccountId != InputVatId)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_PostNothing_ForAZeroTotalSettlement()
    {
        var (handler, posting) = CreateHandler();

        await handler.HandleAsync(Event(0m));

        await posting.DidNotReceiveWithAnyArgs().PostSystemVoucherAsync(default!, default);
    }
}
