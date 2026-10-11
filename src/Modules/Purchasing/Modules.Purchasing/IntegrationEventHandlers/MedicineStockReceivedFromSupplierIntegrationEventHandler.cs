using System.Data;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Services;
using FSH.Modules.Sales.Contracts.Fiscal;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.IntegrationEventHandlers;

/// <summary>
/// Records stock received from a supplier through a medicine create/edit or bulk import as a
/// <see cref="DirectGoodsReceipt"/>, so it is listed with the other direct receipts, appears in the
/// purchase register, and can be voided. Inventory already added the stock, so unlike
/// CreateDirectGoodsReceiptCommandHandler nothing is received here; the payable and purchase voucher
/// are posted by Suppliers and Accounting from <see cref="DirectGoodsReceiptPostedIntegrationEvent"/>,
/// which is what a void later reverses. Events without lines (queued before they existed) are left to
/// the Suppliers/Accounting handlers of the inventory event.
/// </summary>
public sealed class MedicineStockReceivedFromSupplierIntegrationEventHandler(
    PurchasingDbContext dbContext,
    IOutboxWriter outbox,
    IReceiptNumberService receiptNumbers)
    : IIntegrationEventHandler<MedicineStockReceivedFromSupplierIntegrationEvent>
{
    public async Task HandleAsync(MedicineStockReceivedFromSupplierIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.Lines is not { Count: > 0 } lines || @event.BranchId is not Guid branchId)
        {
            return;
        }

        bool exists = await dbContext.DirectGoodsReceipts
            .AnyAsync(r => r.Id == @event.ReceiptId, ct)
            .ConfigureAwait(false);
        if (exists)
        {
            return;
        }

        var receipt = DirectGoodsReceipt.Create(
            @event.SupplierId,
            @event.ReceiptDateUtc,
            @event.SupplierInvoiceNumber,
            string.IsNullOrWhiteSpace(@event.ReceivedBy) ? "system" : @event.ReceivedBy,
            branchId,
            @event.ReceiptId);

        foreach (var line in lines.Where(l => l.Quantity > 0 && l.Quantity * l.UnitCost > 0))
        {
            receipt.AddLine(line.MedicineId, line.Quantity, line.UnitCost, line.VatAmount);
        }

        if (receipt.Lines.Count == 0)
        {
            return;
        }

        // Read before the transaction opens (the branch lives in another module).
        string branchCode = await receiptNumbers.ResolveBranchCodeAsync(branchId, ct).ConfigureAwait(false);

        // The serial number, the receipt row and its posted event commit together (the outbox joins
        // this transaction), so a failure releases the number.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, ct)
            .ConfigureAwait(false);

        int fiscalYear = NepalFiscalYear.StartYearFor(receipt.ReceiptDateUtc);
        int sequence = await receiptNumbers.ReserveNextAsync(branchId, fiscalYear, ct).ConfigureAwait(false);
        receipt.AssignNumber(ReceiptNumberService.Format(branchCode, fiscalYear, sequence), fiscalYear);

        dbContext.DirectGoodsReceipts.Add(receipt);
        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);

        await outbox.AddAsync(new DirectGoodsReceiptPostedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: @event.TenantId,
            CorrelationId: @event.CorrelationId,
            Source: "Purchasing",
            ReceiptId: receipt.Id,
            SupplierId: receipt.SupplierId,
            GrossAmount: receipt.GrossAmount,
            ReceiptDateUtc: receipt.ReceiptDateUtc,
            VatAmount: receipt.VatAmount,
            BranchId: branchId,
            ReceiptNumber: receipt.ReceiptNumber,
            SupplierInvoiceNumber: receipt.SupplierInvoiceNumber,
            Payment: ReceiptPaymentResolver.Resolve(
                @event.Payment?.Method, @event.Payment?.Amount, @event.Payment?.Reference, @event.Payment?.PaymentDateUtc,
                receipt.GrossAmount, receipt.ReceiptDateUtc)),
            ct).ConfigureAwait(false);

        await transaction.CommitAsync(ct).ConfigureAwait(false);
    }
}
