using FSH.Modules.Accounting.Contracts.Dtos;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetOwnerDashboard;

/// <summary>
/// Sign conventions for the owner dashboard, kept apart from the queries so they are unit-testable. Every
/// "net" input is debit minus credit for that account (as the trial balance reports it).
/// </summary>
public static class OwnerDashboardMath
{
    public sealed record LedgerFigures(
        decimal Receivables,
        decimal Payables,
        decimal VatPayable,
        decimal NetSales,
        decimal CostOfGoodsSold,
        IReadOnlyList<OwnerDashboardMoneyAccountDto> MoneyAccounts);

    public static LedgerFigures FromNets(
        decimal receivablesNet,
        decimal payablesNet,
        decimal outputVatNet,
        decimal inputVatNet,
        decimal salesRevenueMonthNet,
        decimal salesReturnsMonthNet,
        decimal cogsMonthNet,
        IReadOnlyList<OwnerDashboardMoneyAccountDto> moneyAccounts)
    {
        ArgumentNullException.ThrowIfNull(moneyAccounts);
        return new LedgerFigures(
            // AR is a debit-balance asset; AP and output VAT are credit-balance liabilities.
            Receivables: receivablesNet,
            Payables: -payablesNet,
            // Output VAT owed less input VAT recoverable (a debit balance) — what a VAT payment would settle now.
            VatPayable: -outputVatNet - inputVatNet,
            // Revenue is a credit balance; Sales Returns is a contra-revenue debit balance that reduces it.
            NetSales: -salesRevenueMonthNet - salesReturnsMonthNet,
            CostOfGoodsSold: cogsMonthNet,
            MoneyAccounts: moneyAccounts);
    }

    /// <summary>Gross profit over net sales, as a percentage to one decimal; null when there were no net sales.</summary>
    public static decimal? GrossMarginPercent(decimal netSales, decimal costOfGoodsSold) =>
        netSales == 0m
            ? null
            : Math.Round((netSales - costOfGoodsSold) / netSales * 100m, 1, MidpointRounding.AwayFromZero);
}
