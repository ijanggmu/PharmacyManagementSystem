using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.IntegrationEventHandlers;

/// <summary>Posts the AP ledger entry for a received purchase order, carrying the supplier's bill number and
/// dated by when the goods were received (the order date only for events queued before the receipt date was
/// carried). The supplier row is locked first (<see cref="SupplierRowLock"/>) so the balance update can't be
/// lost to a concurrent payment, and an order already on the ledger is skipped, so a redelivered event never
/// double-counts it.</summary>
public sealed class PurchaseOrderReceivedIntegrationEventHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IIntegrationEventHandler<PurchaseOrderReceivedIntegrationEvent>
{
    public async Task HandleAsync(PurchaseOrderReceivedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        decimal amount = @event.TotalAmount + @event.VatAmount;
        if (amount <= 0)
        {
            // Free goods (bonus stock, samples): nothing is owed. A 0/0 ledger row is noise on the statement
            // and bill allocation; post nothing.
            return;
        }

        Guid? branchId = @event.BranchId ?? await currentBranch.GetBranchIdAsync(ct).ConfigureAwait(false);
        // The order's number when it has one (not its internal id, which means nothing to the user).
        string orderLabel = string.IsNullOrWhiteSpace(@event.OrderNumber) ? @event.PurchaseOrderId.ToString() : @event.OrderNumber;
        string description = string.IsNullOrWhiteSpace(@event.SupplierInvoiceNumber)
            ? $"Purchase order {orderLabel}"
            : $"Purchase order {orderLabel} (bill {@event.SupplierInvoiceNumber})";
        DateTime entryDateUtc = @event.ReceivedAtUtc ?? @event.OrderDateUtc;

        await SupplierRowLock.InTransactionAsync(dbContext, async () =>
        {
            var supplier = await SupplierRowLock.LockAsync(dbContext, @event.SupplierId, ct, includeDeleted: true).ConfigureAwait(false);

            // Checked under the lock, so two deliveries of the same event can't both post it.
            bool alreadyPosted = await dbContext.SupplierLedgerEntries
                .AnyAsync(e => e.SupplierId == @event.SupplierId
                    && e.EntryType == SupplierLedgerEntryType.Purchase
                    && e.ReferenceType == "PurchaseOrder"
                    && e.ReferenceId == @event.PurchaseOrderId, ct)
                .ConfigureAwait(false);
            if (alreadyPosted)
            {
                return false;
            }

            // A purchase received increases what the pharmacy owes: debit side of the AP ledger.
            decimal newBalance = supplier.ApplyLedgerEntry(debitAmount: amount, creditAmount: 0m);
            dbContext.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
                supplier.Id, entryDateUtc, SupplierLedgerEntryType.Purchase,
                description, debitAmount: amount, creditAmount: 0m, runningBalance: newBalance,
                referenceType: "PurchaseOrder", referenceId: @event.PurchaseOrderId, branchId: branchId,
                documentNumber: @event.OrderNumber,
                supplierBillNumber: @event.SupplierInvoiceNumber,
                dueDateUtc: supplier.DueDateFor(entryDateUtc, @event.DueDateUtc)));

            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
            return true;
        }, ct).ConfigureAwait(false);
    }
}
