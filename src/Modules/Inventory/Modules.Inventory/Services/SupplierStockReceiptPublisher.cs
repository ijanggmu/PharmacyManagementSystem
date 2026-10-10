using System.Diagnostics;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// The supplier-payable half of the legacy receiving flow (inventory-supplier-receipt-service.ts
/// postDirectInventorySupplierReceipts, called from createMedicineWithInventory and
/// updateMedicineWithInventory). When stock increases on a medicine that has a supplier, the net
/// line cost (quantity x unit cost) must be positive, and the gross payable is net plus VAT.
/// The event carries the bill's lines, so Purchasing records it as a DirectGoodsReceipt and posts
/// the AP ledger entry and purchase voucher from there; Inventory never references those modules'
/// runtime projects.
/// </summary>
public static class SupplierStockReceiptPublisher
{
    /// <summary>Single-medicine bill (create or edit medicine).</summary>
    public static Task PublishIfPayableAsync(
        IOutboxWriter outbox,
        ICurrentUser currentUser,
        Guid medicineId,
        Guid? supplierId,
        decimal quantity,
        decimal unitCost,
        decimal vatAmount,
        string? supplierInvoiceNumber,
        Guid? branchId,
        CancellationToken cancellationToken,
        DateTime? receiptDateUtc = null,
        SupplierBillPayment? payment = null)
    {
        if (supplierId is null)
        {
            return Task.CompletedTask;
        }

        return PublishBillAsync(
            outbox, currentUser, supplierId.Value,
            [new SupplierStockReceiptLine(medicineId, quantity, unitCost, vatAmount)],
            supplierInvoiceNumber, branchId, receiptDateUtc, cancellationToken, payment);
    }

    /// <summary>
    /// One supplier bill with one or more medicine lines (bulk import consolidates rows sharing a
    /// supplier and invoice number into one bill). Lines with no positive quantity or value are
    /// dropped; nothing is published when no line remains.
    /// </summary>
    public static async Task PublishBillAsync(
        IOutboxWriter outbox,
        ICurrentUser currentUser,
        Guid supplierId,
        IReadOnlyList<SupplierStockReceiptLine> lines,
        string? supplierInvoiceNumber,
        Guid? branchId,
        DateTime? receiptDateUtc,
        CancellationToken cancellationToken,
        SupplierBillPayment? payment = null)
    {
        ArgumentNullException.ThrowIfNull(outbox);
        ArgumentNullException.ThrowIfNull(currentUser);
        ArgumentNullException.ThrowIfNull(lines);

        var payable = lines.Where(l => l.Quantity > 0 && l.Quantity * l.UnitCost > 0).ToList();
        if (payable.Count == 0)
        {
            return;
        }

        decimal netAmount = payable.Sum(l => l.Quantity * l.UnitCost);
        decimal vatAmount = payable.Sum(l => l.VatAmount);
        string? invoice = string.IsNullOrWhiteSpace(supplierInvoiceNumber) ? null : supplierInvoiceNumber.Trim();

        await outbox.AddAsync(new MedicineStockReceivedFromSupplierIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
            Source: "Inventory",
            ReceiptId: Guid.CreateVersion7(),
            MedicineId: payable[0].MedicineId,
            SupplierId: supplierId,
            GrossAmount: netAmount + vatAmount,
            ReceiptDateUtc: receiptDateUtc ?? DateTime.UtcNow,
            SupplierInvoiceNumber: invoice,
            VatAmount: vatAmount,
            BranchId: branchId,
            // A DirectGoodsReceipt always belongs to one branch, so without one the event falls back
            // to the direct payable posting by Suppliers/Accounting.
            Lines: branchId is null ? null : payable,
            ReceivedBy: currentUser.Name ?? currentUser.GetUserId().ToString(),
            // Paying a bill needs the receipt Purchasing records from the lines, so it rides with them.
            Payment: branchId is null ? null : payment),
            cancellationToken).ConfigureAwait(false);
    }
}
