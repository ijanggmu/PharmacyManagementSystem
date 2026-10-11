namespace FSH.Modules.Suppliers.Contracts.Dtos;

/// <summary>One historical receipt line's unit cost — mirrors <c>SupplierCostHistoryRow</c>
/// (supplier-cost-history-service.ts).</summary>
public sealed record SupplierCostHistoryDto(
    Guid MedicineId,
    string MedicineName,
    DateTime ReceiptDateUtc,
    decimal UnitCost,
    decimal QuantityReceived);
