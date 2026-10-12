using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Services;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;

namespace FSH.Modules.Suppliers.Services;

/// <summary>
/// Callers of <see cref="RecordPurchaseAsync"/>/<see cref="RecordReturnAsync"/> include both
/// in-request handlers (<c>CommitMigrationSessionCommandHandler</c> in Onboarding, which has a real
/// <c>ICurrentUser</c>/branch-header context) and background integration-event handlers
/// (<c>PurchaseOrderReceivedIntegrationEventHandler</c>, <c>DirectGoodsReceiptPostedIntegrationEventHandler</c>,
/// <c>DirectGoodsReceiptVoidedIntegrationEventHandler</c>, <c>ConsignmentSettledIntegrationEventHandler</c>)
/// dispatched off the Outbox, which carry no HTTP/branch-header context and no authenticated
/// <c>ICurrentUser</c> — see eventing.md "Background handlers carry no HTTP/tenant context." None of
/// those four events carry a <c>BranchId</c> field today, so for the background path
/// <see cref="ICurrentBranch.GetBranchIdAsync"/> falls through its resolution chain to the tenant's
/// default branch (or <c>null</c> if the tenant has none) rather than a header/user selection — this
/// is the documented fallback the branch-scoping plan calls for when "that call site doesn't have an
/// obvious branch to stamp." If Purchasing's receiving flow later needs entries attributed to the
/// *receiving* branch specifically, the fix is to add a <c>BranchId</c> field to those four events at
/// the source, not to guess here.
///
/// <para>Each posting locks the supplier row inside a transaction (<see cref="SupplierRowLock"/>) before it
/// reads and moves the balance, so concurrent postings never lose an update. A purchase or return whose
/// source document is already on the ledger is skipped (<see cref="SupplierLedgerIdempotency"/>), so a
/// redelivered integration event never posts twice.</para>
/// </summary>
public sealed class SupplierLedgerService(SuppliersDbContext dbContext, ICurrentBranch currentBranch) : ISupplierLedgerService
{
    public ValueTask RecordPurchaseAsync(
        Guid supplierId, decimal amount, DateTime purchaseDateUtc, string? description,
        string? referenceType, Guid? referenceId, Guid? branchId = null, CancellationToken cancellationToken = default) =>
        // A purchase received increases what the pharmacy owes: debit side of the AP ledger.
        PostAsync(supplierId, debit: amount, credit: 0m, purchaseDateUtc, SupplierLedgerEntryType.Purchase,
            description, referenceType, referenceId, branchId, cancellationToken);

    public ValueTask RecordReturnAsync(
        Guid supplierId, decimal amount, DateTime returnDateUtc, string? description,
        string? referenceType, Guid? referenceId, Guid? branchId = null, CancellationToken cancellationToken = default) =>
        // A return/void reduces what the pharmacy owes: credit side of the AP ledger.
        PostAsync(supplierId, debit: 0m, credit: amount, returnDateUtc, SupplierLedgerEntryType.Return,
            description, referenceType, referenceId, branchId, cancellationToken);

    private async ValueTask PostAsync(
        Guid supplierId, decimal debit, decimal credit, DateTime entryDateUtc, SupplierLedgerEntryType entryType,
        string? description, string? referenceType, Guid? referenceId, Guid? branchId, CancellationToken cancellationToken)
    {
        branchId ??= await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        await SupplierRowLock.InTransactionAsync(dbContext, async () =>
        {
            var supplier = await SupplierRowLock.LockAsync(dbContext, supplierId, cancellationToken, includeDeleted: true).ConfigureAwait(false);

            // Checked under the lock: a redelivered event (consignment settlement, receipt void, stock
            // receipt) must not post the same document twice.
            if (SupplierLedgerIdempotency.IsDocumentPosting(entryType, referenceType, referenceId)
                && await SupplierLedgerIdempotency.IsPostedAsync(
                        dbContext, supplierId, entryType, referenceType!, referenceId!.Value, cancellationToken)
                    .ConfigureAwait(false))
            {
                return false;
            }

            decimal newBalance = supplier.ApplyLedgerEntry(debitAmount: debit, creditAmount: credit);
            dbContext.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
                supplier.Id, entryDateUtc, entryType,
                description, debitAmount: debit, creditAmount: credit, runningBalance: newBalance,
                referenceType, referenceId, branchId));

            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return true;
        }, cancellationToken).ConfigureAwait(false);
    }
}
