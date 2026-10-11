using FSH.Modules.Inventory.Contracts.Events;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// The .NET port of createMedicineRecordOnly/createMedicineWithInventory (medicine-service.ts):
/// optionally seeds an initial batch alongside the medicine row, instead of creating a bare medicine
/// with no stock. When <see cref="InitialStockQuantity"/> is greater than zero, the handler reuses
/// <c>IStockReceiptService</c> (the same internal surface Purchasing calls when receiving stock) to
/// create the batch — see CreateMedicineCommandHandler.
/// </summary>
public sealed record CreateMedicineCommand(
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
    string? ControlledSchedule = null,
    // Opening stock bought from SupplierId and paid at entry; null = on credit. Needs a supplier and stock.
    SupplierBillPayment? Payment = null,
    // A medicine with the same name + strength + form already exists: false (default) rejects with 409
    // so the form can offer "add as new batch to existing"; true creates a separate product anyway.
    bool AllowDuplicate = false) : ICommand<Guid>;
