using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Services;
using Mediator;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders;

internal static class PurchaseOrderMapper
{
    public static ValueTask<PurchasingNames> LoadNamesAsync(
        IMediator mediator, IReadOnlyCollection<PurchaseOrder> orders, CancellationToken cancellationToken) =>
        PurchasingNames.LoadAsync(
            mediator,
            orders.Select(o => o.SupplierId),
            orders.SelectMany(o => o.Lines).Select(l => l.MedicineId),
            cancellationToken);

    public static PurchaseOrderDto ToDto(PurchaseOrder order, PurchasingNames names) =>
        new(
            order.Id, order.SupplierId, names.Supplier(order.SupplierId), order.OrderDateUtc, order.Status.ToString(),
            order.Narration, order.TotalAmount, order.CreatedAtUtc, order.ApprovedAtUtc, order.ApprovedBy,
            order.ReceivedAtUtc, order.ReceivedBy, order.CancelledAtUtc, order.CancelReason,
            order.SupplierInvoiceNumber, order.TotalVatAmount,
            order.Lines
                .Select(l => new PurchaseOrderLineDto(
                    l.Id, l.MedicineId, names.Medicine(l.MedicineId), l.BatchNo, l.ExpiryDate, l.Quantity,
                    l.UnitCostPrice, l.SellingPrice, l.RackLocation, l.VatAmount,
                    l.FreeQuantity, l.DiscountPercent, l.DiscountAmount, l.BillDiscountAmount, l.GrossAmount, l.NetAmount,
                    l.EffectiveUnitCost, l.PackSize, l.PackUnitCost))
                .ToList(),
            order.BranchId,
            order.SubtotalAmount, order.LineDiscountAmount, order.BillDiscountPercent, order.BillDiscountAmount);
}
