namespace FSH.Modules.Sales.Contracts.v1.Sales;

/// <summary>
/// A cart line. <paramref name="UnitPrice"/> is accepted for request-shape compatibility only and is
/// IGNORED: the unit price is always read from the medicine catalog / FEFO batch selling price.
/// <paramref name="DiscountPercent"/> (0-100) is the legacy per-line percent discount;
/// <paramref name="DiscountAmount"/> is an additional absolute discount, kept for existing callers.
/// </summary>
public sealed record SaleItemInput(
    Guid MedicineId,
    decimal Quantity,
    decimal UnitPrice = 0m,
    decimal DiscountAmount = 0m,
    decimal DiscountPercent = 0m);
