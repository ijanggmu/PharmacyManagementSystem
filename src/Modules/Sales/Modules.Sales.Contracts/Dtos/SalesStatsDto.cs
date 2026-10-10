namespace FSH.Modules.Sales.Contracts.Dtos;

public sealed record SalesStatsDto(
    int SaleCount,
    decimal TotalRevenue,
    decimal TotalDiscount,
    decimal AverageSaleAmount);
