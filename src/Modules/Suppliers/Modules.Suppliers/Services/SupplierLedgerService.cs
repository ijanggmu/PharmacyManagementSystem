using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Services;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;

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
/// </summary>
public sealed class SupplierLedgerService(SuppliersDbContext dbContext, ICurrentBranch currentBranch) : ISupplierLedgerService
{
    public async ValueTask RecordPurchaseAsync(
        Guid supplierId, decimal amount, DateTime purchaseDateUtc, string? description,
        string? referenceType, Guid? referenceId, Guid? branchId = null, CancellationToken cancellationToken = default)
    {
        var supplier = await dbContext.Suppliers
            .FirstOrDefaultAsync(s => s.Id == supplierId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {supplierId} not found.");

        // A purchase received increases what the pharmacy owes: debit side of the AP ledger.
        decimal newBalance = supplier.ApplyLedgerEntry(debitAmount: amount, creditAmount: 0m);

        branchId ??= await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var entry = SupplierLedgerEntry.Create(
            supplier.Id, purchaseDateUtc, SupplierLedgerEntryType.Purchase,
            description, debitAmount: amount, creditAmount: 0m, runningBalance: newBalance,
            referenceType, referenceId, branchId);

        dbContext.SupplierLedgerEntries.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask RecordReturnAsync(
        Guid supplierId, decimal amount, DateTime returnDateUtc, string? description,
        string? referenceType, Guid? referenceId, Guid? branchId = null, CancellationToken cancellationToken = default)
    {
        var supplier = await dbContext.Suppliers
            .FirstOrDefaultAsync(s => s.Id == supplierId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {supplierId} not found.");

        // A return/void reduces what the pharmacy owes: credit side of the AP ledger.
        decimal newBalance = supplier.ApplyLedgerEntry(debitAmount: 0m, creditAmount: amount);

        branchId ??= await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var entry = SupplierLedgerEntry.Create(
            supplier.Id, returnDateUtc, SupplierLedgerEntryType.Return,
            description, debitAmount: 0m, creditAmount: amount, runningBalance: newBalance,
            referenceType, referenceId, branchId);

        dbContext.SupplierLedgerEntries.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }
}
