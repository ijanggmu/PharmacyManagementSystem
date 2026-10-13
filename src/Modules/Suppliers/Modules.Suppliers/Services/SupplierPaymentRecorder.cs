using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;

namespace FSH.Modules.Suppliers.Services;

/// <summary>
/// The one way a payment to a supplier is written: the credit on the AP ledger (optionally allocated to one
/// bill) plus the <see cref="SupplierPaymentRecordedIntegrationEvent"/> Accounting posts the Dr AP / Cr Cash|Bank
/// voucher from. Used by the payment endpoint and by "paid at entry" on a goods receipt, so both behave the same.
/// The caller saves and publishes, inside one transaction.
/// </summary>
internal static class SupplierPaymentRecorder
{
    /// <summary>Finds the bill a payment targets and checks the payment fits in what is still owed on it.</summary>
    public static SupplierBill ResolveBill(
        SupplierBillAllocator.Result allocation, string? billReferenceType, Guid billReferenceId, decimal amount)
    {
        ArgumentNullException.ThrowIfNull(allocation);

        var bill = allocation.Bills.FirstOrDefault(b =>
                b.ReferenceId == billReferenceId
                && (string.IsNullOrWhiteSpace(billReferenceType)
                    || string.Equals(b.ReferenceType, billReferenceType.Trim(), StringComparison.OrdinalIgnoreCase)))
            ?? throw new NotFoundException($"No bill {billReferenceId} was found on this supplier's account.");

        if (bill.Outstanding <= 0)
        {
            throw new CustomException(
                $"Bill {bill.Entry.DocumentNumber ?? bill.Entry.SupplierBillNumber ?? bill.ReferenceId.ToString()} is already fully settled.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (amount > bill.Outstanding)
        {
            throw new CustomException(
                $"The payment ({amount:0.00}) is more than what is still owed on this bill ({bill.Outstanding:0.00}). " +
                "Pay the outstanding amount, or record the payment without a bill to settle the oldest bills first.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        return bill;
    }

    /// <summary>Adds the payment's ledger entry (not saved). A bill-allocated payment carries the bill's
    /// reference and numbers, so the ledger shows which bill it paid.</summary>
    public static SupplierLedgerEntry AddPayment(
        SuppliersDbContext dbContext,
        Supplier supplier,
        decimal amount,
        DateTime paymentDateUtc,
        string? description,
        string? billReferenceType,
        Guid? billReferenceId,
        string? billDocumentNumber,
        string? billSupplierNumber,
        Guid? branchId,
        decimal tdsAmount = 0m)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(supplier);

        // A payment reduces what the pharmacy owes: credit side of the AP ledger.
        decimal newBalance = supplier.ApplyLedgerEntry(debitAmount: 0m, creditAmount: amount);

        var entry = SupplierLedgerEntry.Create(
            supplier.Id, paymentDateUtc, SupplierLedgerEntryType.Payment,
            description, debitAmount: 0m, creditAmount: amount, runningBalance: newBalance,
            referenceType: billReferenceId is null ? null : billReferenceType,
            referenceId: billReferenceId,
            branchId: branchId,
            documentNumber: billDocumentNumber,
            supplierBillNumber: billSupplierNumber,
            tdsAmount: tdsAmount);

        dbContext.SupplierLedgerEntries.Add(entry);
        return entry;
    }

    public static SupplierPaymentRecordedIntegrationEvent BuildEvent(
        string? tenantId,
        string correlationId,
        Supplier supplier,
        SupplierLedgerEntry entry,
        string? description,
        Guid? branchId,
        string? paymentMethod,
        SupplierPaymentTds? tds = null)
    {
        ArgumentNullException.ThrowIfNull(supplier);
        ArgumentNullException.ThrowIfNull(entry);

        return new SupplierPaymentRecordedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: tenantId,
            CorrelationId: correlationId,
            Source: "Suppliers",
            LedgerEntryId: entry.Id,
            SupplierId: supplier.Id,
            SupplierName: supplier.Name,
            Amount: entry.CreditAmount,
            Description: description,
            BranchId: branchId,
            PaymentMethod: string.IsNullOrWhiteSpace(paymentMethod) ? null : paymentMethod.Trim(),
            // The business date of the payment (the ledger entry date), not when the event was raised.
            PaymentDateUtc: entry.EntryDateUtc,
            TdsAmount: tds?.Amount ?? 0m,
            TdsCategory: tds?.Category,
            TdsRatePercent: tds?.RatePercent,
            TdsTaxableAmount: tds?.TaxableAmount,
            SupplierPan: string.IsNullOrWhiteSpace(supplier.TaxId) ? null : supplier.TaxId.Trim(),
            DocumentReference: entry.SupplierBillNumber ?? entry.DocumentNumber);
    }
}
