using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using Mediator;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CreatePurchaseOrder;

public sealed class CreatePurchaseOrderCommandHandler(PurchasingDbContext dbContext, ICurrentBranch currentBranch)
    : ICommandHandler<CreatePurchaseOrderCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreatePurchaseOrderCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // The ordering branch is the one that receives the goods.
        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        var order = PurchaseOrder.CreateDraft(
            command.SupplierId, command.OrderDateUtc, command.Narration, command.SupplierInvoiceNumber, branchId);

        foreach (var line in command.Lines)
        {
            order.AddLine(
                line.MedicineId, line.BatchNo, line.ExpiryDate, line.Quantity,
                line.UnitCostPrice, line.SellingPrice, line.RackLocation, line.VatAmount);
        }

        dbContext.PurchaseOrders.Add(order);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return order.Id;
    }
}
