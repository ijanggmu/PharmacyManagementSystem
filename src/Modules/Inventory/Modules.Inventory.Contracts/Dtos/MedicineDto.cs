namespace FSH.Modules.Inventory.Contracts.Dtos;

/// <summary>
/// <see cref="BatchNearestExpiry"/>/<see cref="BatchCount"/>/<see cref="BatchRackLocations"/>/
/// <see cref="FefoPicks"/> are the .NET port of medicine-service.ts's decorateWithBatchAgg output
/// (batch_nearest_expiry/batch_count/batch_rack_locations/fefo_picks). The first three summarize
/// EVERY batch row for the medicine (regardless of quantity or disposed status, so a
/// disposed/expired/zero-quantity lot is still visible to inventory); <see cref="FefoPicks"/> is the
/// strict, FEFO-ordered subset a sale could actually draw from today — see
/// FSH.Modules.Inventory.Services.MedicineBatchAggregator.
/// </summary>
public sealed record MedicineDto(
    Guid Id,
    string Name,
    string? GenericName,
    Guid? CategoryId,
    decimal ReorderLevel,
    bool IsControlled,
    decimal TotalQuantityOnHand,
    bool IsArchived,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc,
    DateTimeOffset? DeletedOnUtc = null,
    string? DeletedBy = null,
    DateOnly? BatchNearestExpiry = null,
    int BatchCount = 0,
    IReadOnlyList<string>? BatchRackLocations = null,
    IReadOnlyList<FefoPickDto>? FefoPicks = null,
    decimal UnitPrice = 0m,
    decimal CostPrice = 0m,
    string? Form = null,
    string? Strength = null,
    Guid? SupplierId = null,
    string? Barcode = null,
    string? Description = null,
    decimal? MaximumStock = null,
    bool PrescriptionRequired = false,
    string? BrandName = null,
    string? Dosage = null,
    string? SideEffects = null,
    string? StorageInstructions = null,
    decimal? StorageTempMinC = null,
    decimal? StorageTempMaxC = null,
    bool RequiresColdChain = false,
    int? UnitsPerPack = null,
    string? UnitLabel = null,
    bool IsTaxable = true,
    string? SupplierInvoiceNumber = null,
    decimal? VatAmount = null,
    decimal? BranchQuantityOnHand = null,
    string? ControlledSchedule = null,
    // Stock the till can actually sell (not recalled, not expired) — the figure low-stock and the
    // stock filters use. Null where the endpoint does not compute it.
    decimal? SellableQuantityOnHand = null,
    decimal? BranchSellableQuantityOnHand = null,
    // True once any lot or stock movement exists. The edit form then locks the details the books and
    // the stock ledger were recorded against (tax flag, unit of count, opening-receipt bill) — the update
    // refuses changes to them. Only GET /medicines/{id} computes it; list rows leave it false.
    bool HasStockHistory = false);
