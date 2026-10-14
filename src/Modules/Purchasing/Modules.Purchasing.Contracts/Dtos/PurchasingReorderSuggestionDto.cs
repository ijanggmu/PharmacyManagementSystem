namespace FSH.Modules.Purchasing.Contracts.Dtos;

/// <summary>
/// One medicine suggested for re-ordering. <c>SupplierId</c>/<c>SupplierName</c> are its preferred supplier, null when
/// it has no active one (it can still be added to an order for another supplier). <c>UnitCost</c> is the latest lot's
/// cost (the medicine's cost price when no lot has one); <c>SuggestedQuantity</c> follows Inventory's
/// <c>ReorderQuantity</c> rule. <c>AverageDailySales</c> is units sold over the 30-day sales window divided by 30.
/// <c>CurrentStock</c> is the SELLABLE on-hand quantity in the CURRENT branch only (not all branches), so it shares
/// one scope with the velocity figures; it is 0 when no branch can be resolved. <c>ReorderLevel</c> and
/// <c>MaximumStock</c> are the medicine's tenant-wide settings.
/// <c>Reason</c> is one of "out_of_stock", "below_minimum" or "will_stock_out_before_resupply".
/// </summary>
public sealed record PurchasingReorderSuggestionDto(
    Guid MedicineId,
    string MedicineName,
    Guid? SupplierId,
    string? SupplierName,
    decimal UnitCost,
    decimal CurrentStock,
    decimal ReorderLevel,
    decimal? MaximumStock,
    decimal SuggestedQuantity,
    decimal AverageDailySales,
    decimal? DaysOfStockLeft,
    string Reason);
