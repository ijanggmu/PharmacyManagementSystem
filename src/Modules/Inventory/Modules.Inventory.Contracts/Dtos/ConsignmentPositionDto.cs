namespace FSH.Modules.Inventory.Contracts.Dtos;

/// <summary>
/// One consigned lot. <see cref="QuantitySold"/> is the units sold from it net of cancellations and customer returns —
/// exactly what settlement bills; <see cref="AmountOwed"/> is the unsettled part of that at
/// <see cref="UnitCostPrice"/>. <see cref="QuantityRemovedOtherwise"/> is stock that left the lot without being sold
/// (written off, counted short, transferred, returned to the supplier) and is never owed.
/// </summary>
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
    DateTime ReceivedDateUtc,
    decimal QuantityRemovedOtherwise = 0m);
