namespace FSH.Modules.Inventory.Contracts.Dtos;

/// <summary>
/// An existing medicine with the same name, strength and form as the one being created. The create
/// form offers to add the new stock as a batch of this medicine instead of creating a duplicate.
/// </summary>
public sealed record DuplicateMedicineDto(
    Guid Id,
    string Name,
    string? GenericName,
    string? BrandName,
    string? Strength,
    string? Form,
    string? Barcode,
    decimal StockOnHand);

/// <summary>A barcode the tenant hasn't used yet.</summary>
public sealed record GeneratedBarcodeDto(string Barcode);
