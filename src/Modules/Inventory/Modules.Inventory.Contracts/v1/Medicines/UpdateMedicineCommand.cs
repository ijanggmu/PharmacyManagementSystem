using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// The .NET port of updateMedicineWithInventory (medicine-service.ts). Two optional stock paths:
/// <list type="bullet">
/// <item><see cref="InitialStockQuantity"/> receives a new batch of that quantity (increase only),
/// via <c>IStockReceiptService</c>. Blank <see cref="BatchNumber"/> is generated and missing
/// <see cref="ExpiryDate"/> is stored as non-expiring.</item>
/// <item><see cref="StockAdjustmentTargetQuantity"/> sets this branch's on-hand quantity to the target
/// with <see cref="StockAdjustmentReason"/>. Decreases consume lots FEFO-first, increases create a
/// lot. Every movement is written to the inventory ledger with the reason.</item>
/// </list>
/// When a stock increase has a supplier, the supplier payable is posted via an outbox event
/// (see MedicineStockReceivedFromSupplierIntegrationEvent). Only one of the two stock paths may be used per request.
/// </summary>
public sealed record UpdateMedicineCommand(
    Guid MedicineId,
    string Name,
    string? GenericName = null,
    Guid? CategoryId = null,
    decimal ReorderLevel = 0m,
    bool IsControlled = false,
    decimal? InitialStockQuantity = null,
    string? BatchNumber = null,
    DateOnly? ExpiryDate = null,
    string? RackLocation = null,
    decimal? CostPrice = null,
    decimal? SellingPrice = null,
    decimal? UnitPrice = null,
    string? Form = null,
    string? Strength = null,
    Guid? SupplierId = null,
    string? Barcode = null,
    string? Description = null,
    decimal? MaximumStock = null,
    bool? PrescriptionRequired = null,
    bool ClearMaximumStock = false,
    string? BrandName = null,
    string? Dosage = null,
    string? SideEffects = null,
    string? StorageInstructions = null,
    decimal? StorageTempMinC = null,
    decimal? StorageTempMaxC = null,
    bool? RequiresColdChain = null,
    int? UnitsPerPack = null,
    string? UnitLabel = null,
    bool? IsTaxable = null,
    string? SupplierInvoiceNumber = null,
    decimal? VatAmount = null,
    bool ClearOptionalDetails = false,
    decimal? StockAdjustmentTargetQuantity = null,
    string? StockAdjustmentReason = null,
    string? ControlledSchedule = null,
    bool ClearControlledSchedule = false,
    // Shown in the price history when this edit changes the selling or cost price.
    string? PriceChangeReason = null,
    // A new lot (InitialStockQuantity) without a supplier: how it was paid for (StockFundingSources:
    // "opening_stock" — the default when omitted — "cash" or "bank"). Cash/bank can't be combined with a supplier.
    string? StockFunding = null) : ICommand<Guid>;
