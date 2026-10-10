using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

/// <summary>
/// In-process batch lookup of customers for other modules. With <c>CustomerIds</c> it resolves those
/// ids (trashed customers included, so old documents keep their names); with <c>Search</c> it returns
/// customers whose name or phone contains the text. Both together intersect. At most
/// <c>MaxResults</c> rows come back. No HTTP endpoint.
/// </summary>
public sealed record LookupCustomersQuery(
    IReadOnlyList<Guid>? CustomerIds = null,
    string? Search = null,
    int MaxResults = LookupCustomersQuery.DefaultMaxResults) : IQuery<IReadOnlyList<CustomerLookupDto>>
{
    public const int DefaultMaxResults = 500;
    public const int MaxIds = 2000;
}
