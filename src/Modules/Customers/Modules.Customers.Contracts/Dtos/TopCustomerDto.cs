namespace FSH.Modules.Customers.Contracts.Dtos;

public sealed record TopCustomerDto(Guid CustomerId, string Name, int SaleCount, decimal TotalSpend);
