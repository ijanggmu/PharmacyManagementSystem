namespace FSH.Modules.Inventory.Contracts.Dtos;

public sealed record InventoryTransactionDto(
    Guid Id,
    Guid MedicineId,
    string? MedicineName,
    Guid BranchId,
    Guid? MedicineBatchId,
    string? BatchNo,
    string TransactionType,
    decimal QuantityDelta,
    decimal UnitCostPrice,
    string? ReferenceType,
    Guid? ReferenceId,
    string? Notes,
    DateTime CreatedAtUtc);
