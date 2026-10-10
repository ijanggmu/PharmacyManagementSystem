using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Suppliers.Contracts.Events;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

public sealed class SupplierReturnCreatedIntegrationEventHandlerTests
{
    private static readonly Guid PayableId = Guid.CreateVersion7();
    private static readonly Guid InventoryId = Guid.CreateVersion7();

    private static (SupplierReturnCreatedIntegrationEventHandler Handler, IVoucherPostingService Posting) CreateHandler()
    {
        var posting = Substitute.For<IVoucherPostingService>();
        var resolver = Substitute.For<IAccountingAccountResolver>();
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, Arg.Any<CancellationToken>()).Returns(PayableId);
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, Arg.Any<CancellationToken>()).Returns(InventoryId);
        return (new SupplierReturnCreatedIntegrationEventHandler(posting, resolver), posting);
    }

    private static SupplierReturnCreatedIntegrationEvent Event(decimal totalCost, Guid? branchId = null) =>
        new(Guid.NewGuid(), DateTime.UtcNow, "test-tenant", "corr", "Suppliers", Guid.CreateVersion7(),
            Guid.CreateVersion7(), totalCost, branchId, DateTime.UtcNow);

    [Fact]
    public async Task HandleAsync_Should_DebitPayableAndCreditInventory_OnTheReturnBranch()
    {
        var (handler, posting) = CreateHandler();
        var branchId = Guid.CreateVersion7();
        var @event = Event(250m, branchId);

        await handler.HandleAsync(@event);

        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.VoucherType == "system_purchase_return"
                && r.ReferenceType == "SupplierReturn"
                && r.ReferenceId == @event.SupplierReturnId
                && r.BranchId == branchId
                && r.Lines.Any(l => l.AccountId == PayableId && l.DebitAmount == 250m)
                && r.Lines.Any(l => l.AccountId == InventoryId && l.CreditAmount == 250m)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_Should_PostNothing_ForAZeroCostReturn()
    {
        var (handler, posting) = CreateHandler();

        await handler.HandleAsync(Event(0m));

        await posting.DidNotReceiveWithAnyArgs().PostSystemVoucherAsync(default!, default);
    }
}
