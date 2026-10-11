using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Suppliers;

/// <summary>
/// Id/name list for supplier pickers, ordered by name. Unlike the paged search (capped at 200 per
/// page) this returns up to <see cref="Limit"/> rows in one call, which is what a dropdown needs.
/// <see cref="Search"/> matches name or phone. Inactive suppliers are left out unless
/// <see cref="IncludeInactive"/> is set. When <see cref="Ids"/> is given, only those suppliers are
/// returned (active or not) — other modules use this to resolve supplier names.
/// </summary>
public sealed record GetSupplierLookupQuery(
    string? Search = null,
    bool IncludeInactive = false,
    int Limit = GetSupplierLookupQuery.DefaultLimit,
    IReadOnlyList<Guid>? Ids = null) : IQuery<IReadOnlyList<SupplierLookupDto>>
{
    public const int DefaultLimit = 500;
    public const int MaxLimit = 1000;
}
