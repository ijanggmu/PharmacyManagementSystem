using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

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

    /// <summary>The numbers of the goods receipts that delivered <paramref name="orders"/>, by receipt id.</summary>
    public static async Task<Dictionary<Guid, string?>> LoadReceiptNumbersAsync(
        PurchasingDbContext dbContext, IReadOnlyCollection<PurchaseOrder> orders, CancellationToken cancellationToken)
    {
        var receiptIds = orders.Where(o => o.GoodsReceiptId is not null).Select(o => o.GoodsReceiptId!.Value).ToList();
        if (receiptIds.Count == 0)
        {
            return [];
        }

        return await dbContext.DirectGoodsReceipts.AsNoTracking()
            .Where(r => receiptIds.Contains(r.Id))
            .ToDictionaryAsync(r => r.Id, r => r.ReceiptNumber, cancellationToken)
            .ConfigureAwait(false);
    }

    public static PurchaseOrderDto ToDto(
        PurchaseOrder order, PurchasingNames names, IReadOnlyDictionary<Guid, string?>? receiptNumbers = null) =>
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
            order.SubtotalAmount, order.LineDiscountAmount, order.BillDiscountPercent, order.BillDiscountAmount,
            order.OrderNumber,
            order.GoodsReceiptId,
            order.GoodsReceiptId is { } receiptId && receiptNumbers is not null && receiptNumbers.TryGetValue(receiptId, out string? number)
                ? number
                : null);
}
