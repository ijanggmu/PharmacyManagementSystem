namespace FSH.Modules.Sales.Contracts.Dtos;

/// <summary>Per-medicine quantity sold and net revenue over a date range (completed sales only).</summary>
public sealed record MedicineSalesAggregateDto(decimal Quantity, decimal Revenue);
