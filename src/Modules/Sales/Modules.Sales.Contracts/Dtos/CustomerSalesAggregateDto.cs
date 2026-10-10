namespace FSH.Modules.Sales.Contracts.Dtos;

/// <summary>Per-customer sale count and total spend over a date range (completed sales only).</summary>
public sealed record CustomerSalesAggregateDto(int SaleCount, decimal TotalSpend);
