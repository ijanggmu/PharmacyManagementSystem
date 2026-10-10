namespace FSH.Modules.Inventory.Contracts.Dtos;

public sealed record ConsignmentPositionDto(
    Guid Id,
    Guid SupplierId,
    Guid? BranchId,
    Guid MedicineId,
    string? MedicineName,
    Guid BatchId,
    string BatchNo,
    decimal QuantityReceived,
    decimal QuantityRemaining,
    decimal QuantitySold,
    decimal UnitCostPrice,
    decimal SettledQuantity,
    decimal AmountOwed,
    DateTime ReceivedDateUtc);
