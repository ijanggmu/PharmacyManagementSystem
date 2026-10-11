namespace FSH.Modules.Inventory.Contracts.Services;

/// <summary>
/// One line to deduct. With <see cref="BatchId"/> the quantity comes from that batch only (e.g. the
/// damaged or expired lot being sent back); without it, FEFO across the medicine's live batches.
/// </summary>
public sealed record StockDeductionLine(Guid MedicineId, decimal Quantity, Guid? BatchId = null);

public sealed record StockDeductionRequest(
    string ReferenceType,
    Guid ReferenceId,
    IReadOnlyList<StockDeductionLine> Lines);

/// <summary>One physical batch FEFO deduction consumed to satisfy a line — the unit cost here is
/// what a caller (e.g. Sales) needs to post a COGS voucher line at actual cost.</summary>
public sealed record BatchDeductionDetail(Guid BatchId, string BatchNo, decimal QuantityDeducted, decimal UnitCostPrice);

public sealed record StockDeductionLineResult(Guid MedicineId, decimal QuantityDeducted, IReadOnlyList<BatchDeductionDetail> Batches);

/// <summary>
/// FEFO (first-expired-first-out) stock deduction — the cross-module surface Sales (and later
/// Purchasing return flows) calls. Checks availability across ALL requested lines before mutating
/// ANY of them, so a multi-item request never partially deducts before failing
/// (pharmacy-modules-plan.md §4.4 / root plan §5, §12).
///
/// Concurrency note: candidate batches are locked with <c>SELECT ... FOR UPDATE</c> and re-read after
/// the lock, so concurrent deductions of the same stock serialize. The lock is held until the
/// caller's transaction ends. Callers that need the deduction to commit atomically with their own
/// writes (Sales does) open a transaction on the scope's shared connection first; this service joins
/// it rather than committing it.
/// </summary>
public interface IStockDeductionService
{
    /// <summary>Throws <c>InsufficientStockException</c> (409) if any line can't be fully satisfied.</summary>
    ValueTask<IReadOnlyList<StockDeductionLineResult>> DeductForSaleAsync(
        StockDeductionRequest request, CancellationToken cancellationToken = default);

    /// <summary>Same deduction as <see cref="DeductForSaleAsync"/> (all-or-nothing across every line,
    /// throws <c>InsufficientStockException</c> if any line can't be fully satisfied; lines may name a
    /// batch), tagged <c>SupplierReturn</c>. Joins the caller's open transaction on the shared
    /// connection so the return and its stock movement commit together (CreateSupplierReturnCommandHandler
    /// opens one); without one it commits on its own.</summary>
    ValueTask<IReadOnlyList<StockDeductionLineResult>> DeductForSupplierReturnAsync(
        StockDeductionRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// FEFO deduction at the caller's current branch for a stock transfer dispatch. Same all-or-nothing
    /// and row-lock rules as <see cref="DeductForSaleAsync"/>, but tagged <c>Transfer</c>. Joins the
    /// caller's open transaction and never commits it: the caller must open one first so the row locks
    /// are held until the transfer rows are written.
    /// </summary>
    ValueTask<IReadOnlyList<StockDeductionLineResult>> DeductForTransferAsync(
        StockDeductionRequest request, CancellationToken cancellationToken = default);

    /// <summary>Reverses a prior deduction (e.g. sale cancellation) — restocks into a NEW batch dated
    /// today rather than undoing the original batches, since they may have moved on since the sale
    /// (root plan §12's "not a raw undo" note).</summary>
    ValueTask RestockFromCancellationAsync(
        string referenceType, Guid referenceId, IReadOnlyList<StockDeductionLineResult> originalDeduction,
        CancellationToken cancellationToken = default);
}
