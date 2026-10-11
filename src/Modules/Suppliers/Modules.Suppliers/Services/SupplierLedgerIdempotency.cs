using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Services;

/// <summary>
/// "Already on the ledger?" check for document postings. Integration events can be redelivered (the inbox
/// mark commits separately from the handler), so a purchase or return for a source document that is already
/// posted is skipped. Callers run it after <see cref="SupplierRowLock.LockAsync"/>, so two concurrent
/// deliveries can't both pass it; the partial unique index <c>IX_SupplierLedgerEntries_Document_Unique</c>
/// backstops it at the database.
/// </summary>
internal static class SupplierLedgerIdempotency
{
    /// <summary>Onboarding opening balances share the migration session as their reference (one per
    /// supplier line), so they are not document postings and are never de-duplicated.</summary>
    public const string MigrationOpeningSupplierReference = "MigrationOpeningSupplier";

    /// <summary>True for the postings the unique index covers: a purchase or return tied to a source document.</summary>
    public static bool IsDocumentPosting(SupplierLedgerEntryType entryType, string? referenceType, Guid? referenceId) =>
        referenceId is not null
        && !string.IsNullOrEmpty(referenceType)
        && entryType is SupplierLedgerEntryType.Purchase or SupplierLedgerEntryType.Return
        && !string.Equals(referenceType, MigrationOpeningSupplierReference, StringComparison.Ordinal);

    public static Task<bool> IsPostedAsync(
        SuppliersDbContext dbContext, Guid supplierId, SupplierLedgerEntryType entryType,
        string referenceType, Guid referenceId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        return dbContext.SupplierLedgerEntries
            .AnyAsync(e => e.SupplierId == supplierId
                && e.EntryType == entryType
                && e.ReferenceType == referenceType
                && e.ReferenceId == referenceId, cancellationToken);
    }
}
