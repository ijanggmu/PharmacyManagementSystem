namespace FSH.Modules.Inventory.Contracts.Dtos;

public sealed record ReorderSuggestionDto(
    Guid MedicineId,
    string MedicineName,
    decimal ReorderLevel,
    decimal TotalQuantityOnHand,
    decimal SuggestedOrderQuantity,
    // Branch the on-hand figure is for; null = all branches combined.
    Guid? BranchId = null);

public sealed record ExpiringBatchDto(
    Guid BatchId,
    Guid MedicineId,
    string MedicineName,
    string BatchNo,
    DateOnly ExpiryDate,
    int DaysUntilExpiry,
    decimal QuantityOnHand,
    Guid? BranchId = null);

/// <summary>A non-deleted medicine flagged <c>IsControlled</c> — see <see cref="FSH.Modules.Inventory.Contracts.v1.Reports.GetControlledMedicinesQuery"/>.</summary>
public sealed record ControlledMedicineDto(Guid MedicineId, string MedicineName, string? GenericName, string? ControlledSchedule = null);

/// <summary>One row of the dead-stock report — see <see cref="FSH.Modules.Inventory.Contracts.v1.Reports.GetDeadStockQuery"/>.</summary>
public sealed record DeadStockRowDto(
    Guid MedicineId,
    string MedicineName,
    decimal StockQuantity,
    decimal InventoryValue,
    DateTime? LastSoldAtUtc,
    DateOnly? NearestExpiryDate,
    // Branch the stock and last-sale figures are for; null = all branches combined.
    Guid? BranchId = null);

/// <summary>
/// One medicine currently below its reorder level — see
/// <see cref="FSH.Modules.Inventory.Contracts.v1.Reports.GetInventoryDiscrepancyReportQuery"/>.
/// </summary>
public sealed record InventoryDiscrepancyEntryDto(
    Guid MedicineId,
    string MedicineName,
    decimal CurrentStock,
    decimal ReorderLevel);

public sealed record InventoryDiscrepancyReportDto(
    DateTime GeneratedAtUtc,
    int TotalMedicines,
    int LowStockCount,
    IReadOnlyList<InventoryDiscrepancyEntryDto> LowStock);

/// <summary>One strictly-expired batch still on hand — see <see cref="FSH.Modules.Inventory.Contracts.v1.Reports.GetExpiredBatchesQuery"/>.
/// <c>ReceivedAtUtc</c> is the batch creation time, which is the receipt time for batches created by stock receipt.
/// <c>IsRecalled</c> distinguishes a lot that is expired *and* was separately recalled (the batch's
/// own <c>IsRecalled</c> flag) from an ordinary expiry — a recall never write-offs stock, so a
/// recalled lot can still be on hand and show up here once it also passes its expiry date; callers
/// that need to disposition the two differently should filter on this column (or the matching
/// filter on <see cref="FSH.Modules.Inventory.Contracts.v1.Reports.GetExpiredBatchesQuery"/>).</summary>
public sealed record ExpiredBatchDto(
    Guid BatchId,
    Guid MedicineId,
    string MedicineName,
    string BatchNo,
    DateOnly ExpiryDate,
    decimal QuantityOnHand,
    decimal CostPrice,
    DateTime ReceivedAtUtc,
    Guid BranchId,
    string? RackLocation,
    bool IsRecalled = false);
