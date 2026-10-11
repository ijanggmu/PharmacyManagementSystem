using System.Data;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.IntegrationEventHandlers;

/// <summary>
/// Posts the AP ledger entry for a direct (non-PO) goods receipt, carrying its GRN and supplier bill numbers.
/// When the bill was paid at entry, the payment is recorded against this receipt in the same transaction and
/// <c>SupplierPaymentRecordedIntegrationEvent</c> is raised for Accounting's Dr AP / Cr Cash|Bank voucher.
/// Skips a receipt that is already on the ledger, so a redelivered event never posts it (or its payment) twice.
/// </summary>
public sealed class DirectGoodsReceiptPostedIntegrationEventHandler(
    SuppliersDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentBranch currentBranch)
    : IIntegrationEventHandler<DirectGoodsReceiptPostedIntegrationEvent>
{
    public async Task HandleAsync(DirectGoodsReceiptPostedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        bool alreadyPosted = await dbContext.SupplierLedgerEntries
            .AnyAsync(e => e.SupplierId == @event.SupplierId
                && e.EntryType == SupplierLedgerEntryType.Purchase
                && e.ReferenceType == "DirectGoodsReceipt"
                && e.ReferenceId == @event.ReceiptId, ct)
            .ConfigureAwait(false);
        if (alreadyPosted)
        {
            return;
        }

        var supplier = await dbContext.Suppliers
            .FirstOrDefaultAsync(s => s.Id == @event.SupplierId, ct)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {@event.SupplierId} not found.");

        Guid? branchId = @event.BranchId ?? await currentBranch.GetBranchIdAsync(ct).ConfigureAwait(false);

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, ct)
            .ConfigureAwait(false);

        // A purchase received increases what the pharmacy owes: debit side of the AP ledger.
        decimal newBalance = supplier.ApplyLedgerEntry(debitAmount: @event.GrossAmount, creditAmount: 0m);
        dbContext.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
            supplier.Id, @event.ReceiptDateUtc, SupplierLedgerEntryType.Purchase,
            PurchaseDescription(@event), debitAmount: @event.GrossAmount, creditAmount: 0m, runningBalance: newBalance,
            referenceType: "DirectGoodsReceipt", referenceId: @event.ReceiptId, branchId: branchId,
            documentNumber: @event.ReceiptNumber, supplierBillNumber: @event.SupplierInvoiceNumber));

        SupplierLedgerEntry? payment = null;
        string? paymentDescription = null;
        if (@event.Payment is { Amount: > 0 } paid)
        {
            paymentDescription = PaymentDescription(@event, paid);
            payment = SupplierPaymentRecorder.AddPayment(
                dbContext, supplier, Math.Min(paid.Amount, @event.GrossAmount), paid.PaymentDateUtc, paymentDescription,
                "DirectGoodsReceipt", @event.ReceiptId, @event.ReceiptNumber, @event.SupplierInvoiceNumber, branchId);
        }

        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);

        if (payment is not null)
        {
            await outbox.AddAsync(
                SupplierPaymentRecorder.BuildEvent(
                    @event.TenantId, @event.CorrelationId, supplier, payment, paymentDescription, branchId, @event.Payment!.Method),
                ct).ConfigureAwait(false);
        }

        await transaction.CommitAsync(ct).ConfigureAwait(false);
    }

    private static string PurchaseDescription(DirectGoodsReceiptPostedIntegrationEvent @event)
    {
        string document = @event.ReceiptNumber ?? $"direct goods receipt {@event.ReceiptId}";
        return string.IsNullOrWhiteSpace(@event.SupplierInvoiceNumber)
            ? $"Purchase {document}"
            : $"Purchase {document} (bill {@event.SupplierInvoiceNumber})";
    }

    private static string PaymentDescription(DirectGoodsReceiptPostedIntegrationEvent @event, DirectGoodsReceiptPayment paid)
    {
        string document = @event.ReceiptNumber ?? @event.SupplierInvoiceNumber ?? @event.ReceiptId.ToString();
        string reference = string.IsNullOrWhiteSpace(paid.Reference) ? string.Empty : $" — ref {paid.Reference}";
        return $"Paid at entry for {document} ({paid.Method}){reference}";
    }
}
