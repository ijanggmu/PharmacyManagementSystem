namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>
/// Owner dashboard KPIs — see <c>GetOwnerDashboardQuery</c>. Sales figures (<c>TodaySales</c>, <c>MonthSales</c>)
/// are what customers were charged (VAT inclusive, from the Sales module) so they match the sales screens; the
/// margin is the GL's: <c>MonthNetSales</c> = Sales Revenue less Sales Returns (VAT excluded) and
/// <c>MonthCostOfGoodsSold</c> = the COGS account, both for [MonthStartUtc, now]. Balances are as of
/// <c>GeneratedAtUtc</c>: receivables/payables are the AR/AP control accounts, cash and bank every 10xx asset
/// account, <c>VatPayable</c> output VAT less recoverable input VAT (negative = a VAT credit).
/// </summary>
public sealed record OwnerDashboardDto(
    DateTime GeneratedAtUtc,
    Guid? BranchId,
    DateTime TodayStartUtc,
    DateTime MonthStartUtc,
    decimal TodaySales,
    int TodaySaleCount,
    decimal MonthSales,
    int MonthSaleCount,
    decimal MonthNetSales,
    decimal MonthCostOfGoodsSold,
    decimal MonthGrossProfit,
    decimal? GrossMarginPercent,
    decimal StockValue,
    decimal Receivables,
    decimal Payables,
    decimal CashAndBankBalance,
    IReadOnlyList<OwnerDashboardMoneyAccountDto> CashAndBankAccounts,
    decimal VatPayable,
    IReadOnlyList<OwnerDashboardTopMedicineDto> TopMedicinesByMargin);

/// <summary>One cash or bank account's balance (debit positive).</summary>
public sealed record OwnerDashboardMoneyAccountDto(Guid AccountId, string Code, string Name, decimal Balance);

/// <summary>One of the month's most profitable medicines (net of VAT, at recorded batch cost).</summary>
public sealed record OwnerDashboardTopMedicineDto(
    Guid MedicineId,
    string Name,
    decimal Quantity,
    decimal NetRevenue,
    decimal Cost,
    decimal Margin,
    decimal? MarginPercent);
