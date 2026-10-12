namespace FSH.Modules.Sales.Domain;

/// <summary>Money through a branch's drawer in a shift window: cash taken on completed sales, non-cash
/// legs, and cash paid back out for returns/refunds completed in the window.</summary>
public sealed record CashDrawerTotals(
    decimal CashSales, decimal NonCashSales, decimal CashRefunds, int SalesCount, decimal CashReceipts = 0m)
{
    /// <summary>What the drawer should hold: the float, plus cash sales and cash customers paid on account,
    /// minus cash paid back out for returns, refunds and cancellations.</summary>
    public decimal ExpectedCash(decimal openingFloat) => openingFloat + CashSales + CashReceipts - CashRefunds;
}
