namespace FSH.Modules.Inventory.Contracts.Services;

/// <summary><paramref name="BatchId"/> takes the quantity from that one batch (e.g. the recalled lot going back to
/// its supplier) instead of FEFO across the medicine's batches.</summary>
public sealed record StockDeductionLine(Guid MedicineId, decimal Quantity, Guid? BatchId = null);

public sealed record StockDeductionRequest(
    string ReferenceType,
    Guid ReferenceId,
    IReadOnlyList<StockDeductionLine> Lines,
    // True when the caller has a transaction open on the scope's shared connection and the deduction must
    // commit or roll back with it (Sales and transfers always join theirs).
    bool JoinCallerTransaction = false);

/// <summary>One physical batch FEFO deduction consumed to satisfy a line — the unit cost here is
/// what a caller (e.g. Sales) needs to post a COGS voucher line at actual cost, and the selling price
/// is the batch's own price: the only selling price a sale is charged at.</summary>
public sealed record BatchDeductionDetail(
    Guid BatchId, string BatchNo, decimal QuantityDeducted, decimal UnitCostPrice, decimal SellingPrice = 0m);

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

    /// <summary>Same FEFO deduction as <see cref="DeductForSaleAsync"/> (all-or-nothing across every
    /// line, throws <c>InsufficientStockException</c> if any line can't be fully satisfied), but
    /// tags the resulting <c>InventoryTransaction</c>s as <c>SupplierReturn</c> instead of
    /// <c>Sale</c> — the surface Suppliers calls, synchronously and pre-commit, from
    /// CreateSupplierReturnCommandHandler (mirrors goods physically leaving the pharmacy back to the
    /// supplier; see supplier-return-service.ts's stock-availability check).</summary>
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

    /// <summary>
    /// Reverses a prior deduction (sale cancellation, customer return) at <paramref name="branchId"/> —
    /// the branch the original sale/return happened at, passed explicitly because this runs from a
    /// background integration-event handler with no request (and so no current branch). Each unit goes
    /// back into the batch it was sold from, keeping that lot's expiry, price and recall state. Only
    /// when that batch is unknown (lines recorded before sales tracked batches) or disposed is a new
    /// batch created, carrying the original lot's expiry and price where known.
    /// </summary>
    ValueTask RestockFromCancellationAsync(
        string referenceType, Guid referenceId, Guid branchId, IReadOnlyList<StockDeductionLineResult> originalDeduction,
        CancellationToken cancellationToken = default);
}
