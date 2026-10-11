namespace FSH.Modules.Sales.Contracts.v1.Refunds;

public sealed record RefundItemInput(Guid SaleItemId, decimal QuantityRefunded);
