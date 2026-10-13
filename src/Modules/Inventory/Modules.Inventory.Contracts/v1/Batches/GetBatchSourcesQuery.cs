using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Batches;

/// <summary>
/// Cross-module (in-process, no endpoint): where the given lots came from and what they are worth — used by
/// Suppliers' expiry claims to group near-expiry lots by the supplier that delivered them and to value a
/// claim. Lots the caller's tenant can't see are simply absent from the result.
/// </summary>
public sealed record GetBatchSourcesQuery(IReadOnlyList<Guid> BatchIds) : IQuery<IReadOnlyList<BatchSourceDto>>;

/// <summary>
/// A lot and where it came from. <c>ReceiptReferenceIds</c>: the documents whose receipt created / topped up
/// the lot (its Purchase movements' reference ids: purchase orders, direct goods receipts), oldest first.
/// <c>PreferredSupplierId</c>: the medicine's preferred supplier — a fallback when no receipt says who
/// delivered the lot. <c>IsConsigned</c>: the supplier's own stock, settled not claimed — never claimable.
/// </summary>
public sealed record BatchSourceDto(
    Guid BatchId,
    Guid MedicineId,
    string MedicineName,
    string BatchNo,
    DateOnly ExpiryDate,
    decimal QuantityOnHand,
    decimal CostPrice,
    Guid BranchId,
    bool IsDisposed,
    bool IsConsigned,
    Guid? PreferredSupplierId,
    IReadOnlyList<Guid> ReceiptReferenceIds);
