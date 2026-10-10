using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.IntegrationEventHandlers;

/// <summary>Posts the AP ledger entry for a received purchase order, carrying the supplier's bill number. Skips
/// an order that is already on the ledger, so a redelivered event never double-counts it.</summary>
public sealed class PurchaseOrderReceivedIntegrationEventHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IIntegrationEventHandler<PurchaseOrderReceivedIntegrationEvent>
{
    public async Task HandleAsync(PurchaseOrderReceivedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        bool alreadyPosted = await dbContext.SupplierLedgerEntries
            .AnyAsync(e => e.SupplierId == @event.SupplierId
                && e.EntryType == SupplierLedgerEntryType.Purchase
                && e.ReferenceType == "PurchaseOrder"
                && e.ReferenceId == @event.PurchaseOrderId, ct)
            .ConfigureAwait(false);
        if (alreadyPosted)
        {
            return;
        }

        var supplier = await dbContext.Suppliers
            .FirstOrDefaultAsync(s => s.Id == @event.SupplierId, ct)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {@event.SupplierId} not found.");

        decimal amount = @event.TotalAmount + @event.VatAmount;
        Guid? branchId = @event.BranchId ?? await currentBranch.GetBranchIdAsync(ct).ConfigureAwait(false);
        string description = string.IsNullOrWhiteSpace(@event.SupplierInvoiceNumber)
            ? $"Purchase order {@event.PurchaseOrderId}"
            : $"Purchase order {@event.PurchaseOrderId} (bill {@event.SupplierInvoiceNumber})";

        // A purchase received increases what the pharmacy owes: debit side of the AP ledger.
        decimal newBalance = supplier.ApplyLedgerEntry(debitAmount: amount, creditAmount: 0m);
        dbContext.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
            supplier.Id, @event.OrderDateUtc, SupplierLedgerEntryType.Purchase,
            description, debitAmount: amount, creditAmount: 0m, runningBalance: newBalance,
            referenceType: "PurchaseOrder", referenceId: @event.PurchaseOrderId, branchId: branchId,
            supplierBillNumber: @event.SupplierInvoiceNumber));

        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
    }
}
