namespace FSH.Modules.Multitenancy.Contracts;

/// <summary>
/// Resolves the acting user's branch-scoping context for the current request. Any module whose
/// entities carry a BranchId (Sales, Inventory, Purchasing, Accounting, Suppliers, Customers, ...)
/// depends on this via <c>Modules.Multitenancy.Contracts</c> — already a common dependency for
/// tenant-scoped modules — never on <c>Modules.Multitenancy</c>'s runtime project.
///
/// <para>
/// Resolution order (first match wins), mirroring the Next.js source's fallback chain in
/// <c>create_sale_with_items</c> / <c>record_customer_payment</c> / <c>post_supplier_payment</c>
/// (scripts 36, 37, 42, 43, 64, 67, 79):
/// </para>
/// <list type="number">
///   <item>The <c>X-Branch-Id</c> request header, when present — validated as an active branch of
///   the caller's resolved tenant, and, for callers without <c>Branches.ViewAll</c>, as their own
///   branch (items 2–3). An unparsable, foreign/inactive or non-own branch throws
///   <see cref="FSH.Framework.Core.Exceptions.ForbiddenException"/> (never silently ignored),
///   per docs/dotnet-migration-plan.md §6.3 ("rejects mismatched X-Branch-Id headers").</item>
///   <item>The caller's persisted selection (<c>FshUser.CurrentBranchId</c>, via
///   <c>IUserProfileService.GetCurrentBranchIdAsync</c>).</item>
///   <item>The tenant's default branch (its oldest branch), when the caller has no selection yet —
///   matches the Next.js backfill semantics.</item>
///   <item><c>null</c>, when the tenant has zero branches at all (e.g. a root/operator calling
///   without a resolved tenant, or a tenant mid-provisioning). Callers MUST treat <c>null</c> as
///   "no branch scoping available" — never substitute an arbitrary branch for it.</item>
/// </list>
///
/// <para>
/// This service is registered <c>Scoped</c> — the resolved value (including the "no branch"
/// outcome) is cached for the lifetime of the request, so repeated calls do not re-hit the
/// database or re-validate the header.
/// </para>
///
/// <para>
/// <b>Required vs. nullable BranchId:</b> whether a given entity's own <c>BranchId</c> column may
/// be <c>null</c> is a per-entity decision made in docs/branch-scoping-plan.md, not by this
/// service. Transactional/stock entities (Sale, SaleItem, InventoryTransaction, GoodsReceipt,
/// MedicineBatch, StockTransfer, CashShift, BankDeposit) require a branch —
/// their handlers should call <see cref="RequireBranchIdAsync"/>. Ledger/reporting entities
/// (AccountingVoucher, AccountingVoucherLine, SupplierLedgerEntry, CustomerLedgerEntry, Expense,
/// SupplierReturn, BankReconciliation, Consignment*) keep BranchId nullable for legacy/tenant-wide
/// rows and optional report filters — their handlers should call <see cref="GetBranchIdAsync"/>
/// and persist <c>null</c> when it returns <c>null</c>.
/// </para>
/// </summary>
public interface ICurrentBranch
{
    /// <summary>
    /// Resolves the branch id per the resolution order documented on <see cref="ICurrentBranch"/>.
    /// Returns <c>null</c> only when the current tenant has no branches configured.
    /// </summary>
    Task<Guid?> GetBranchIdAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Branch filter for LIST queries that omit an explicit <c>branchId</c>. Returns <c>null</c> (no
    /// branch filter, i.e. all branches) when the current caller holds
    /// <c>MultitenancyPermissions.Branches.ViewAll</c>; otherwise returns exactly what
    /// <see cref="GetBranchIdAsync"/> returns. Returns <c>null</c> when there is no tenant.
    /// Write paths must keep using <see cref="GetBranchIdAsync"/> / <see cref="RequireBranchIdAsync"/>.
    /// </summary>
    Task<Guid?> GetListFilterBranchIdAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Branch filter for read queries that accept an optional, caller-supplied <c>branchId</c>.
    /// A caller holding <c>MultitenancyPermissions.Branches.ViewAll</c> gets
    /// <paramref name="requestedBranchId"/> back unchanged (<c>null</c> = all branches). Any other
    /// caller is confined to their own branch (<see cref="GetBranchIdAsync"/>): <c>null</c> or their
    /// own id resolves to their own id, and any other branch throws
    /// <see cref="FSH.Framework.Core.Exceptions.ForbiddenException"/>. When there is no branch to
    /// confine to (no tenant / no branches), the requested id is returned as-is.
    /// </summary>
    Task<Guid?> ResolveListBranchFilterAsync(Guid? requestedBranchId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Whether the caller holds <c>MultitenancyPermissions.Branches.ViewAll</c>. Cached per request.
    /// </summary>
    Task<bool> CanViewAllBranchesAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Same resolution as <see cref="GetBranchIdAsync"/>, but throws
    /// <see cref="FSH.Framework.Core.Exceptions.NotFoundException"/> instead of returning
    /// <c>null</c>. Use this from handlers for entities whose <c>BranchId</c> column is required
    /// (<c>NOT NULL</c>) — see docs/branch-scoping-plan.md for the exact list.
    /// </summary>
    Task<Guid> RequireBranchIdAsync(CancellationToken cancellationToken = default);
}
