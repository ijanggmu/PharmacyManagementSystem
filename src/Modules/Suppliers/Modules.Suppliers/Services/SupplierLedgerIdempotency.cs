using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Services;

/// <summary>
/// Shared "already on the ledger?" check for integration-event handlers. An event can be redelivered
/// (the inbox mark commits separately from the handler), so each handler skips a source document that is
/// already posted. The partial unique index IX_SupplierLedgerEntries_Document_Unique backstops it.
/// </summary>
internal static class SupplierLedgerIdempotency
{
    public static Task<bool> IsPostedAsync(
        SuppliersDbContext dbContext, Guid supplierId, SupplierLedgerEntryType entryType,
        string referenceType, Guid referenceId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        return dbContext.SupplierLedgerEntries.AsNoTracking()
            .AnyAsync(e => e.SupplierId == supplierId
                && e.EntryType == entryType
                && e.ReferenceType == referenceType
                && e.ReferenceId == referenceId, cancellationToken);
    }
}
