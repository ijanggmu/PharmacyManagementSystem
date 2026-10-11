namespace FSH.Modules.Inventory.Contracts.Dtos;

public sealed record TopSellingMedicineDto(Guid MedicineId, string Name, decimal Quantity, decimal Revenue);
