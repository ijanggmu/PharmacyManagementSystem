using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Services;
using Mediator;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CreatePurchaseOrder;

/// <summary>
/// Creates a draft order. Lines entered in packs are converted to base units with the medicine's units per pack
/// (looked up from Inventory); the bill discount is applied after every line is added, so it is spread over all of
/// them.
/// </summary>
public sealed class CreatePurchaseOrderCommandHandler(PurchasingDbContext dbContext, ICurrentBranch currentBranch, IMediator mediator)
    : ICommandHandler<CreatePurchaseOrderCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreatePurchaseOrderCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // The ordering branch is the one that receives the goods.
        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        await SupplierGuard.EnsureActiveAsync(mediator, command.SupplierId, cancellationToken).ConfigureAwait(false);

        // Only lines entered in packs need the medicine (for its units per pack).
        var packMedicines = new Dictionary<Guid, MedicineDto>();
        foreach (var medicineId in command.Lines.Where(l => l.InPacks).Select(l => l.MedicineId).Distinct())
        {
            packMedicines[medicineId] = await mediator.Send(new GetMedicineByIdQuery(medicineId), cancellationToken).ConfigureAwait(false);
        }

        var order = PurchaseOrder.CreateDraft(
            command.SupplierId, command.OrderDateUtc, command.Narration, command.SupplierInvoiceNumber, branchId);

        foreach (var line in command.Lines)
        {
            packMedicines.TryGetValue(line.MedicineId, out var medicine);
            var baseLine = PurchaseLinePacks.ToBase(
                line.Quantity, line.UnitCostPrice, line.FreeQuantity, line.DiscountPercent, line.DiscountAmount,
                line.InPacks, medicine?.UnitsPerPack, medicine?.Name);
            order.AddLine(
                line.MedicineId, line.BatchNo, line.ExpiryDate, baseLine.Quantity,
                baseLine.UnitCostPrice, line.SellingPrice, line.RackLocation, line.VatAmount, baseLine.Terms);
        }

        order.ApplyBillDiscount(command.BillDiscountPercent, command.BillDiscountAmount);

        dbContext.PurchaseOrders.Add(order);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return order.Id;
    }
}
