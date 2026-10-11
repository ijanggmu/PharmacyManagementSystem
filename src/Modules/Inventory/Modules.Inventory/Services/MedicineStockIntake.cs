using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;

namespace FSH.Modules.Inventory.Services;

/// <summary>Stock entered from the medicine form: one received line plus its supplier bill or opening-stock posting.</summary>
public sealed record MedicineStockLine(
    Guid MedicineId,
    string MedicineName,
    decimal Quantity,
    string? BatchNumber,
    DateOnly? ExpiryDate,
    string? RackLocation,
    decimal? CostPrice,
    decimal? SellingPrice,
    Guid? SupplierId,
    string? SupplierInvoiceNumber,
    decimal? VatAmount,
    SupplierBillPayment? Payment);

/// <summary>
/// Shared by create-medicine (opening stock) and add-medicine-stock (new batch of an existing
/// medicine). Receives the line through <see cref="IStockReceiptService"/> — the surface Purchasing
/// uses — then posts it: with a supplier it is a purchase (direct goods receipt + payable), without
/// one it is opening stock the pharmacy already owns, valued into Inventory against equity.
/// </summary>
public static class MedicineStockIntake
{
    public static async Task<Guid> ReceiveAsync(
        IStockReceiptService stockReceiptService,
        IOutboxWriter outbox,
        ICurrentUser currentUser,
        ICurrentBranch currentBranch,
        MedicineStockLine line,
        string referenceType,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(stockReceiptService);
        ArgumentNullException.ThrowIfNull(currentBranch);
        ArgumentNullException.ThrowIfNull(line);

        decimal unitCost = line.CostPrice ?? 0m;

        // A missing batch number is generated and a missing expiry is stored as non-expiring
        // (StockReceiptService applies the legacy defaults).
        var received = await stockReceiptService.ReceiveAsync(
            new StockReceiptRequest(
                ReferenceType: referenceType,
                ReferenceId: line.MedicineId,
                Lines: [
                    new StockReceiptLine(
                        line.MedicineId,
                        line.BatchNumber,
                        line.ExpiryDate,
                        line.Quantity,
                        unitCost,
                        line.SellingPrice ?? 0m,
                        line.RackLocation)
                ]),
            cancellationToken).ConfigureAwait(false);

        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        if (line.SupplierId is not null)
        {
            await SupplierStockReceiptPublisher.PublishIfPayableAsync(
                outbox, currentUser, line.MedicineId, line.SupplierId, line.Quantity, unitCost,
                line.VatAmount ?? 0m, line.SupplierInvoiceNumber, branchId, cancellationToken,
                payment: line.Payment).ConfigureAwait(false);
        }
        else
        {
            await OpeningStockPublisher.PublishAsync(
                outbox, currentUser, line.Quantity * unitCost, $"Opening stock for {line.MedicineName}", branchId,
                cancellationToken).ConfigureAwait(false);
        }

        return received[0].BatchId;
    }
}
