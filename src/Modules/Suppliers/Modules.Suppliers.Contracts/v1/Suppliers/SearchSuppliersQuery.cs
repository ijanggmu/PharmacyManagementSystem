using FSH.Framework.Shared.Persistence;
using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Suppliers;

/// <summary>
/// Paged supplier search. <see cref="IsComplete"/> filters on the contact profile: true keeps suppliers with
/// a contact person, phone and email on file; false keeps those missing any of the three.
/// </summary>
public sealed record SearchSuppliersQuery(
    string? Search = null,
    bool? IsActive = null,
    int PageNumber = 1,
    int PageSize = 50,
    string? SortBy = null,
    string? SortDir = null,
    bool? IsComplete = null) : IQuery<PagedResponse<SupplierDto>>;
