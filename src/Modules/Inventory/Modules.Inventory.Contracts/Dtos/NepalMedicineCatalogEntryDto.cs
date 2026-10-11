namespace FSH.Modules.Inventory.Contracts.Dtos;

/// <summary>
/// One row of the shared (cross-tenant) Nepal medicine reference catalog — ported from
/// Next.js `nepal_medicine_catalog` (scripts/54-create-nepal-medicine-catalog.sql,
/// scripts/78-expand-nepal-medicine-catalog.sql). Used to prefill/suggest known Nepali brands
/// when a pharmacist is adding a new medicine.
/// </summary>
public sealed record NepalMedicineCatalogEntryDto(
    Guid Id,
    string BrandName,
    string? GenericName,
    string? Form,
    string? Strength,
    string? Manufacturer,
    string? CategoryName,
    string? Dosage,
    decimal? UnitPrice,
    decimal? CostPrice,
    string? Description,
    string? SideEffects,
    string? StorageInstructions,
    bool PrescriptionRequired);
