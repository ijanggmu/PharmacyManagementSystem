namespace FSH.Modules.Suppliers.Contracts.Services;

/// <summary>
/// The cross-module surface other modules use to post AP ledger movements — Purchasing calls
/// <see cref="RecordPurchaseAsync"/> on receiving a purchase order (pharmacy-modules-plan.md §4.5).
/// Implemented by <c>Modules.Suppliers</c>'s runtime and registered for DI by <c>SuppliersModule</c>;
/// a caller only needs a reference to this Contracts project.
/// </summary>
public interface ISupplierLedgerService
{
    /// <summary>Increases the supplier's payable balance (debit side of the AP ledger) for a
    /// received purchase order.</summary>
    ValueTask RecordPurchaseAsync(
        Guid supplierId,
        decimal amount,
        DateTime purchaseDateUtc,
        string? description,
        string? referenceType,
        Guid? referenceId,
        // Branch to attribute the entry to; null = the caller's current branch.
        Guid? branchId = null,
        CancellationToken cancellationToken = default);

    /// <summary>Decreases the supplier's payable balance (credit side of the AP ledger) — e.g.
    /// reversing a voided direct goods receipt, or a return to supplier.</summary>
    ValueTask RecordReturnAsync(
        Guid supplierId,
        decimal amount,
        DateTime returnDateUtc,
        string? description,
        string? referenceType,
        Guid? referenceId,
        // Branch to attribute the entry to; null = the caller's current branch.
        Guid? branchId = null,
        CancellationToken cancellationToken = default);
}
