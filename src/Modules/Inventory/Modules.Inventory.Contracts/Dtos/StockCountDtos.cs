namespace FSH.Modules.Inventory.Contracts.Dtos;

/// <summary>A stock count session in a list. <c>Status</c>: Draft, Counting, Review, Posted, Cancelled.</summary>
public sealed record StockCountSessionDto(
    Guid Id,
    string SessionNumber,
    string Title,
    Guid BranchId,
    string Status,
    Guid? CategoryId,
    string? RackLocation,
    Guid? SupplierId,
    string? Notes,
    DateTime CreatedAtUtc,
    DateTime? SnapshotAtUtc,
    DateTime? SubmittedAtUtc,
    DateTime? PostedAtUtc,
    DateTime? CancelledAtUtc,
    int LineCount,
    int CountedLineCount,
    decimal PostedGainValue,
    decimal PostedLossValue);

/// <summary>
/// One lot of a count with its variance. While the session is open the expected quantity and variance are
/// computed live (snapshot + the lot's movements up to when it was counted); once posted they are the
/// figures frozen at posting. Null expected/variance = not counted yet.
/// </summary>
public sealed record StockCountLineDto(
    Guid Id,
    Guid MedicineId,
    string MedicineName,
    Guid? BatchId,
    string BatchNo,
    DateOnly? ExpiryDate,
    string? RackLocation,
    decimal UnitCost,
    decimal SnapshotQuantity,
    DateTime SnapshotAtUtc,
    bool IsFoundLot,
    decimal? CountedQuantity,
    DateTime? CountedAtUtc,
    string? Note,
    decimal MovementsSinceSnapshot,
    decimal? ExpectedQuantity,
    decimal? VarianceQuantity,
    decimal? VarianceValue,
    decimal? CurrentSystemQuantity,
    decimal? PostedDelta);

public sealed record StockCountSessionDetailDto(
    StockCountSessionDto Session,
    IReadOnlyList<StockCountLineDto> Lines,
    decimal GainValue,
    decimal LossValue,
    decimal NetValue);
