namespace FSH.Modules.Suppliers.Contracts.Dtos;

/// <summary>
/// A near-expiry / expired lot that can be claimed back from the supplier that delivered it.
/// <c>Attribution</c>: "Receipt" (a goods receipt or purchase order recorded the supplier), "PreferredSupplier"
/// (no receipt says; the medicine's preferred supplier is assumed) or "Unknown".
/// </summary>
public sealed record ExpiryClaimCandidateLotDto(
    Guid BatchId,
    Guid MedicineId,
    string MedicineName,
    string BatchNo,
    DateOnly ExpiryDate,
    int DaysUntilExpiry,
    bool IsExpired,
    decimal QuantityOnHand,
    decimal AlreadyClaimedQuantity,
    decimal ClaimableQuantity,
    decimal UnitCost,
    decimal ClaimableValue,
    string Attribution);

public sealed record ExpiryClaimCandidateGroupDto(
    Guid? SupplierId,
    string? SupplierName,
    IReadOnlyList<ExpiryClaimCandidateLotDto> Lots,
    decimal TotalValue);

public sealed record ExpiryClaimLineDto(
    Guid Id,
    Guid MedicineId,
    string MedicineName,
    Guid BatchId,
    string BatchNo,
    DateOnly ExpiryDate,
    decimal Quantity,
    decimal UnitCost,
    decimal Value,
    decimal? AcceptedQuantity);

/// <summary>An expiry claim. <c>Status</c>: Draft, Sent, Accepted, Credited, Rejected.</summary>
public sealed record ExpiryClaimDto(
    Guid Id,
    string ClaimNumber,
    Guid SupplierId,
    string? SupplierName,
    Guid? BranchId,
    string Status,
    string? Notes,
    DateTime CreatedAtUtc,
    DateTime? SentAtUtc,
    DateTime? RespondedAtUtc,
    DateTime? CreditedAtUtc,
    Guid? SupplierReturnId,
    string? DebitNoteNumber,
    string? SupplierCreditNoteNumber,
    string? RejectionReason,
    decimal ClaimedValue,
    decimal AcceptedValue,
    int LineCount,
    IReadOnlyList<ExpiryClaimLineDto> Lines);
