using FSH.Framework.Core.Domain;

namespace FSH.Modules.Inventory.Domain;

/// <summary>
/// Shared (cross-tenant) reference row of known Nepali medicine brands — ported from Next.js
/// `nepal_medicine_catalog` (scripts/54-create-nepal-medicine-catalog.sql,
/// scripts/78-expand-nepal-medicine-catalog.sql). Used to prefill/suggest known brands when a
/// pharmacist creates a new <see cref="Medicine"/>; it is seed/reference data maintained by the
/// platform, not tenant-owned, hence <see cref="IGlobalEntity"/>.
/// </summary>
public sealed class NepalMedicineCatalogEntry : AggregateRoot<Guid>, IGlobalEntity
{
    public string BrandName { get; private set; } = default!;
    public string? GenericName { get; private set; }
    public string? Form { get; private set; }
    public string? Strength { get; private set; }
    public string? Manufacturer { get; private set; }
    public string? CategoryName { get; private set; }
    public string? Dosage { get; private set; }
    public decimal? UnitPrice { get; private set; }
    public decimal? CostPrice { get; private set; }
    public string? Description { get; private set; }
    public string? SideEffects { get; private set; }
    public string? StorageInstructions { get; private set; }
    public bool PrescriptionRequired { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    private NepalMedicineCatalogEntry() { }

    public static NepalMedicineCatalogEntry Create(
        string brandName,
        string? genericName = null,
        string? form = null,
        string? strength = null,
        string? manufacturer = null,
        string? categoryName = null,
        string? dosage = null,
        decimal? unitPrice = null,
        decimal? costPrice = null,
        string? description = null,
        string? sideEffects = null,
        string? storageInstructions = null,
        bool prescriptionRequired = false)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(brandName);

        return new NepalMedicineCatalogEntry
        {
            Id = Guid.CreateVersion7(),
            BrandName = brandName.Trim(),
            GenericName = genericName?.Trim(),
            Form = form?.Trim(),
            Strength = strength?.Trim(),
            Manufacturer = manufacturer?.Trim(),
            CategoryName = categoryName?.Trim(),
            Dosage = dosage?.Trim(),
            UnitPrice = unitPrice,
            CostPrice = costPrice,
            Description = description?.Trim(),
            SideEffects = sideEffects?.Trim(),
            StorageInstructions = storageInstructions?.Trim(),
            PrescriptionRequired = prescriptionRequired,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }
}
