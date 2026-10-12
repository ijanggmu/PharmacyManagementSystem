using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.Services;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;

namespace FSH.Modules.Suppliers.IntegrationEventHandlers;

/// <summary>Posts the AP ledger entry for stock received on a medicine create or stock increase that
/// carried a supplier — the same debit-to-payable effect as a direct goods receipt.</summary>
public sealed class MedicineStockReceivedFromSupplierIntegrationEventHandler(ISupplierLedgerService supplierLedgerService, SuppliersDbContext dbContext)
    : IIntegrationEventHandler<MedicineStockReceivedFromSupplierIntegrationEvent>
{
    public async Task HandleAsync(MedicineStockReceivedFromSupplierIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        // An event with lines is recorded by Purchasing as a direct goods receipt, which posts this
        // through DirectGoodsReceiptPostedIntegrationEvent (so voiding the receipt reverses it).
        if (@event.Lines is { Count: > 0 })
        {
            return;
        }

        string invoice = string.IsNullOrWhiteSpace(@event.SupplierInvoiceNumber)
            ? string.Empty
            : $" (invoice {@event.SupplierInvoiceNumber})";

        if (await SupplierLedgerIdempotency.IsPostedAsync(
                dbContext, @event.SupplierId, SupplierLedgerEntryType.Purchase, "MedicineStockReceipt", @event.ReceiptId, ct)
            .ConfigureAwait(false))
        {
            return;
        }

        await supplierLedgerService.RecordPurchaseAsync(
            @event.SupplierId, @event.GrossAmount, @event.ReceiptDateUtc,
            $"Stock received for medicine {@event.MedicineId}{invoice}", "MedicineStockReceipt", @event.ReceiptId, @event.BranchId, ct)
            .ConfigureAwait(false);
    }
}
