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
/// </summary>
public sealed record StockReceiptLine(
    Guid MedicineId,
    string? BatchNo,
    DateOnly? ExpiryDate,
    decimal Quantity,
    decimal CostPrice,
    decimal SellingPrice,
    string? RackLocation = null);

public sealed record StockReceiptRequest(
    string ReferenceType,
    Guid ReferenceId,
    IReadOnlyList<StockReceiptLine> Lines,
    // Branch to receive into; null = the caller's current branch. Callers must have authorized it.
    Guid? BranchId = null,
    // True when the caller has opened a transaction on the scope's shared connection and the receipt must
    // commit or roll back with it (same joining as StockDeductionService.DeductForSaleAsync).
    bool JoinCallerTransaction = false);

public sealed record StockReceiptLineResult(Guid MedicineId, Guid BatchId, string BatchNo, decimal QuantityReceived);

/// <summary>
/// Takes back the stock a receipt added (<paramref name="ReferenceType"/>/<paramref name="ReferenceId"/> as it
/// was received), recorded under <paramref name="ReversalReferenceType"/>/<paramref name="ReversalReferenceId"/>.
/// </summary>
public sealed record StockReceiptReversalRequest(
    string ReferenceType,
    Guid ReferenceId,
    string ReversalReferenceType,
    Guid ReversalReferenceId,
    bool JoinCallerTransaction = false);

/// <summary>The cross-module surface Purchasing calls to add stock on a receipt.</summary>
public interface IStockReceiptService
{
    ValueTask<IReadOnlyList<StockReceiptLineResult>> ReceiveAsync(
        StockReceiptRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Reverses a receipt: takes each quantity back out of the exact batch (and branch) the receipt put it
    /// into, at that receipt's cost — never other lots chosen by expiry, and recalled or expired lots
    /// included, since the stock is going back. Throws <c>InsufficientStockException</c> (409) and changes
    /// nothing when any of those batches no longer holds what the receipt added (part of it was sold or used).
    /// A second call for the same reversal reference is a no-op.
    /// </summary>
    ValueTask ReverseReceiptAsync(StockReceiptReversalRequest request, CancellationToken cancellationToken = default);
}
