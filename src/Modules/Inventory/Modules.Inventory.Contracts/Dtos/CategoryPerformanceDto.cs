namespace FSH.Modules.Inventory.Contracts.Dtos;

/// <summary>Null CategoryId groups medicines with no assigned category ("uncategorized").</summary>
public sealed record CategoryPerformanceDto(Guid? CategoryId, decimal Quantity, decimal Revenue, int MedicineCount);
