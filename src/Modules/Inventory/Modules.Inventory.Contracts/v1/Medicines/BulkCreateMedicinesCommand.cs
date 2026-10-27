using FSH.Modules.Inventory.Contracts.Events;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// One medicine in a bulk-import submission. Mirrors the per-row fields
/// `bulkRowSchema` (app/api/medicines/bulk/route.ts) validates for a single medicine, plus the
/// optional initial-batch fields the existing CreateBatchCommand already exposes — since this
/// .NET port has no Suppliers/Purchasing module yet, the source's per-bill-group supplier
/// consolidation (`supplierId`/`supplierInvoiceNumber`/consolidated goods receipt) is not
/// carried over; see BulkCreateMedicinesCommandHandler remarks.
/// </summary>
public sealed record BulkMedicineRow(
    string Name,
    string? GenericName = null,
    Guid? CategoryId = null,
    decimal ReorderLevel = 0m,
    bool IsControlled = false,
    string? BatchNo = null,
    DateOnly? ExpiryDate = null,
    decimal Quantity = 0m,
    decimal CostPrice = 0m,
    decimal SellingPrice = 0m,
    string? RackLocation = null,
    decimal UnitPrice = 0m,
    string? Form = null,
    string? Strength = null,
    decimal? MaximumStock = null,
    bool PrescriptionRequired = false,
    bool IsTaxable = false,
    Guid? SupplierId = null,
    string? SupplierInvoiceNumber = null,
    decimal VatAmount = 0m,
    // Supplier bill date; null means today. Rows of one bill (same supplier + invoice) share it.
    DateOnly? ReceiptDate = null,
    // The bill was paid at entry; null = on credit. Rows of one bill share it (the first row that sets it wins).
    SupplierBillPayment? Payment = null,
    // The rest of the medicine card, as on CreateMedicineCommand. Used only when the row creates a new
    // medicine; a row that adds stock to an existing medicine leaves that medicine's details as they are.
    string? BrandName = null,
    string? Description = null,
    string? Dosage = null,
    string? Barcode = null,
    int? UnitsPerPack = null,
    string? UnitLabel = null,
    int? PacksPerBox = null,
    string? BoxLabel = null,
    bool RequiresColdChain = false,
    decimal? StorageTempMinC = null,
    decimal? StorageTempMaxC = null,
    string? SideEffects = null,
    string? StorageInstructions = null);

/// <summary>
/// One row's medicine id plus the batch id, if the row carried stock. <see cref="AddedToExisting"/>
/// is true when the row matched a medicine that already existed (same name + strength + form, in the
/// database or earlier in the import), so its stock went onto that medicine instead of a duplicate.
/// </summary>
public sealed record BulkCreatedMedicine(Guid MedicineId, Guid? BatchId, bool AddedToExisting = false);

public sealed record BulkCreateMedicinesResult(IReadOnlyList<BulkCreatedMedicine> Created);

/// <summary>
/// Ported from app/api/medicines/bulk/route.ts + `bulkCreateMedicinesWithConsolidatedReceipts`
/// (lib/server/services/medicine-service.ts): validate every row, then insert all of them
/// atomically — if any row fails, nothing in the submission is saved. See the handler for what
/// was intentionally not carried over.
/// </summary>
public sealed record BulkCreateMedicinesCommand(IReadOnlyList<BulkMedicineRow> Rows) : ICommand<BulkCreateMedicinesResult>;
