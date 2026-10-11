namespace FSH.Modules.Inventory.Contracts.Dtos;

/// <summary>Tenant-wide medicine counts (legacy getMedicineInventoryStats shape, camelCase on the wire).</summary>
public sealed record MedicineStatsDto(
    int Total,
    int LowStock,
    int ExpiringSoon,
    int Expired,
    decimal TotalValue);
