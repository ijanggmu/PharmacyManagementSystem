namespace FSH.Modules.Suppliers.Contracts.Dtos;

/// <summary>One row of a supplier's price list. <paramref name="UnitCost"/> is per base unit (e.g. per tablet);
/// <paramref name="UnitsPerPack"/> is the medicine's pack size (null when not packed), for showing a pack price.</summary>
public sealed record SupplierPriceListItemDto(
    Guid Id,
    Guid SupplierId,
    Guid MedicineId,
    string MedicineName,
    int? UnitsPerPack,
    decimal UnitCost,
    decimal? MinOrderQuantity,
    DateOnly ValidFrom,
    DateOnly? ValidTo,
    string? Notes,
    bool IsActive,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc);

/// <summary>The supplier's agreed price for a medicine on a given date (per base unit).</summary>
public sealed record SupplierPriceDto(
    Guid ItemId,
    Guid SupplierId,
    Guid MedicineId,
    string MedicineName,
    decimal UnitCost,
    decimal? MinOrderQuantity,
    DateOnly ValidFrom,
    DateOnly? ValidTo);
