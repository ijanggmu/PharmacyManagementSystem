namespace FSH.Modules.Customers.Contracts.Dtos;

/// <summary>The identifying fields of a customer — what another module needs to label or search
/// documents that only store a customer id (sales, returns, refunds).</summary>
public sealed record CustomerLookupDto(Guid Id, string Name, string? Phone);
