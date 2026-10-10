namespace FSH.Modules.Inventory.Contracts.Dtos;

public sealed record MedicineBatchDto(
    Guid Id,
    Guid MedicineId,
    string? MedicineName,
    Guid BranchId,
    string BatchNo,
    DateOnly ExpiryDate,
    decimal QuantityOnHand,
    decimal CostPrice,
    decimal SellingPrice,
    string? RackLocation,
    bool IsDisposed,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc,
    bool IsRecalled = false,
    DateTime? RecalledAtUtc = null,
    string? RecallReason = null,
    string? BranchName = null,
    decimal? ReceivedQuantity = null);
