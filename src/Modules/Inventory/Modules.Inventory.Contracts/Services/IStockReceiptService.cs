namespace FSH.Modules.Inventory.Contracts.Services;

/// <summary>
/// One line of stock received onto a (possibly new) batch. If <paramref name="BatchNo"/> matches an
/// existing, non-disposed batch for the medicine, quantity is added to it; otherwise a new batch is
/// created — mirrors how a pharmacy actually receives stock (same batch number restocked, or a new
/// batch/expiry arriving).
///
/// <para>When <paramref name="BatchNo"/> is null or blank, a legacy-format number is generated
/// (<c>AUTO-{unixMillis}-{random6}</c>, medicine-service.ts's insertMedicineBatchRow). When
/// <paramref name="ExpiryDate"/> is null the lot is recorded as non-expiring
/// (<c>DateOnly.MaxValue</c>), which matches the legacy
/// schema that accepts a null expiry for every medicine.</para>
///
/// <para><paramref name="Quantity"/> is every unit going into the lot, including <paramref name="FreeQuantity"/> —
/// the bonus units of a supplier scheme (e.g. the 1 of 10+1), which are already part of <paramref name="Quantity"/>.
/// <paramref name="CostPrice"/> is the effective cost per unit with the free units included (the caller spreads the
/// bill's net value over all of them), so the lot is valued at what was actually paid. <paramref name="FreeQuantity"/>
/// is informational: it is noted on the purchase inventory transaction.</para>
/// </summary>
public sealed record StockReceiptLine(
    Guid MedicineId,
    string? BatchNo,
    DateOnly? ExpiryDate,
    decimal Quantity,
    decimal CostPrice,
    decimal SellingPrice,
    string? RackLocation = null,
    decimal FreeQuantity = 0m);

public sealed record StockReceiptRequest(
    string ReferenceType,
    Guid ReferenceId,
    IReadOnlyList<StockReceiptLine> Lines,
    // Branch to receive into; null = the caller's current branch. Callers must have authorized it.
    Guid? BranchId = null,
    // True when the caller has already opened a transaction on the scope's shared connection (e.g. on its
    // own DbContext) and wants the stock write to commit or roll back with it. The service then never
    // begins or commits a transaction itself. False = the receipt is its own unit of work.
    bool JoinCallerTransaction = false);

public sealed record StockReceiptLineResult(Guid MedicineId, Guid BatchId, string BatchNo, decimal QuantityReceived);

/// <summary>
/// One line of a receipt being reversed (a voided goods receipt). With <paramref name="BatchId"/> the
/// quantity must come back out of that exact lot; without it the service looks for the lots the original
/// receipt created (its <c>Purchase</c> inventory transactions) and, failing that, the oldest-expiring
/// live lots of the medicine at the request's branch.
/// </summary>
public sealed record StockReceiptReversalLine(Guid MedicineId, decimal Quantity, Guid? BatchId = null);

/// <summary>
/// Takes the stock of an earlier receipt back out. <paramref name="BranchId"/> is the branch the goods
/// were received at (never the caller's ambient branch). <paramref name="OriginalReferenceType"/>/
/// <paramref name="OriginalReferenceId"/> identify the receipt's own inventory transactions, used to
/// find the lots of lines that carry no <see cref="StockReceiptReversalLine.BatchId"/> (legacy rows).
/// </summary>
public sealed record StockReceiptReversalRequest(
    string ReferenceType,
    Guid ReferenceId,
    Guid BranchId,
    IReadOnlyList<StockReceiptReversalLine> Lines,
    string? OriginalReferenceType = null,
    Guid? OriginalReferenceId = null,
    bool JoinCallerTransaction = false);

public sealed record StockReceiptReversalLineResult(Guid MedicineId, IReadOnlyList<BatchDeductionDetail> Batches);

/// <summary>The cross-module surface Purchasing calls to add stock on a receipt (and take it back out
/// when the receipt is voided).</summary>
public interface IStockReceiptService
{
    /// <summary>Adds stock. Topping up an existing lot locks its row (<c>SELECT ... FOR UPDATE</c>) so a
    /// concurrent sale deduction of that lot is never lost.</summary>
    ValueTask<IReadOnlyList<StockReceiptLineResult>> ReceiveAsync(
        StockReceiptRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Reverses a receipt: deducts each line from the lot(s) the receipt put the stock into, at the
    /// receipt's branch, tagged <c>PurchaseReversal</c>. All-or-nothing: the lots are locked first and
    /// <c>InsufficientStockException</c> (409) is thrown, before anything moves, when any of them no longer
    /// holds the quantity (it was sold, transferred or written off since).
    /// </summary>
    ValueTask<IReadOnlyList<StockReceiptReversalLineResult>> ReverseReceiptAsync(
        StockReceiptReversalRequest request, CancellationToken cancellationToken = default);
}
