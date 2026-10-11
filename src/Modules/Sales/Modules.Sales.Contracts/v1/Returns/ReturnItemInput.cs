namespace FSH.Modules.Sales.Contracts.v1.Returns;

/// <summary><paramref name="PackagingCondition"/> mirrors the Next.js Zod enum ("sealed" | "opened" |
/// "damaged"); parsed case-insensitively by the handler.</summary>
public sealed record ReturnItemInput(
    Guid SaleItemId,
    decimal QuantityReturned,
    string Reason,
    string PackagingCondition = "opened");
