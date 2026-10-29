namespace FSH.Modules.Inventory.Contracts.Services;

/// <summary>
/// One line to deduct. With <see cref="BatchId"/> the quantity comes from that batch only (e.g. the
/// damaged or expired lot being sent back); without it, FEFO across the medicine's live batches — or, when
/// <see cref="AllowedBatchIds"/> is set, FEFO across only those batches (a supplier return limited to the lots
/// that supplier delivered).
/// </summary>
public sealed record StockDeductionLine(
    Guid MedicineId, decimal Quantity, Guid? BatchId = null, IReadOnlyCollection<Guid>? AllowedBatchIds = null);

public sealed record StockDeductionRequest(
    string ReferenceType,
    Guid ReferenceId,
    IReadOnlyList<StockDeductionLine> Lines);

/// <summary>One physical batch FEFO deduction consumed to satisfy a line — the unit cost here is
/// what a caller (e.g. Sales) needs to post a COGS voucher line at actual cost, and the selling price is what
/// a sale charges for the units taken from this batch (read under the batch lock, so it is the price of the
/// stock actually drawn).</summary>
public sealed record BatchDeductionDetail(
    Guid BatchId, string BatchNo, decimal QuantityDeducted, decimal UnitCostPrice, decimal SellingPrice = 0m,
    bool IsTaxable = true);

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

    /// <summary>Legacy surface: same as <see cref="RestockAsync"/> with the original deduction looked up
    /// under (<paramref name="referenceType"/>, <paramref name="referenceId"/>) and the branch taken from
    /// it (falling back to the caller's current branch).</summary>
    ValueTask RestockFromCancellationAsync(
        string referenceType, Guid referenceId, IReadOnlyList<StockDeductionLineResult> originalDeduction,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Puts sold stock back on the shelf (sale cancellation, customer return). Quantities go back into
    /// the lots the original sale drew from (found through its <c>Sale</c> inventory transactions), so
    /// they keep their real batch number, expiry and selling price. A lot that has since been disposed
    /// is re-opened as a new lot with the same number, expiry and price. Stock the original deduction
    /// cannot account for goes to the earliest live lot of that medicine at the branch. Never invents an
    /// expiry. Idempotent per (<see cref="StockRestockRequest.ReferenceType"/>,
    /// <see cref="StockRestockRequest.ReferenceId"/>). Opens its own transaction when the caller has none.
    /// </summary>
    ValueTask RestockAsync(StockRestockRequest request, CancellationToken cancellationToken = default);
}

/// <summary>One medicine to put back, at the cost the sale recorded for it.</summary>
public sealed record StockRestockLine(Guid MedicineId, decimal Quantity, decimal UnitCostPrice);

/// <summary>
/// A restock of previously sold stock. <see cref="BranchId"/> is the branch the stock goes back to —
/// pass it from the originating event; background handlers have no current branch. When null, the
/// branch the original sale deducted from is used.
/// </summary>
public sealed record StockRestockRequest(
    string ReferenceType,
    Guid ReferenceId,
    string OriginalReferenceType,
    Guid OriginalReferenceId,
    Guid? BranchId,
    IReadOnlyList<StockRestockLine> Lines,
    string? Notes = null);
