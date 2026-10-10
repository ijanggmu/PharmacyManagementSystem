using FSH.Framework.Shared.Persistence;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.SearchSuppliers;

public sealed class SearchSuppliersQueryHandler(SuppliersDbContext dbContext)
    : IQueryHandler<SearchSuppliersQuery, PagedResponse<SupplierDto>>
{
    public async ValueTask<PagedResponse<SupplierDto>> Handle(SearchSuppliersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.Suppliers.AsNoTracking().AsQueryable();

        if (query.IsActive is { } isActive)
        {
            q = q.Where(s => s.IsActive == isActive);
        }

        if (query.IsComplete is { } isComplete)
        {
            q = isComplete
                ? q.Where(s =>
                    s.ContactPerson != null && s.ContactPerson != string.Empty &&
                    s.Phone != null && s.Phone != string.Empty &&
                    s.Email != null && s.Email != string.Empty)
                : q.Where(s =>
                    s.ContactPerson == null || s.ContactPerson == string.Empty ||
                    s.Phone == null || s.Phone == string.Empty ||
                    s.Email == null || s.Email == string.Empty);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string term = query.Search.Trim();
            q = q.Where(s =>
                EF.Functions.ILike(s.Name, $"%{term}%") ||
                (s.Phone != null && EF.Functions.ILike(s.Phone, $"%{term}%")) ||
                (s.Email != null && EF.Functions.ILike(s.Email, $"%{term}%")));
        }

        q = ApplySort(q, query.SortBy, query.SortDir);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var suppliers = await q
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<SupplierDto>
        {
            Items = suppliers
                .Select(s => new SupplierDto(
                    s.Id, s.Name, s.ContactPerson, s.Phone, s.Email, s.Address, s.TaxId,
                    s.CurrentBalance, s.IsActive, s.CreatedAtUtc, s.UpdatedAtUtc, s.DeletedOnUtc, s.DeletedBy))
                .ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size)
        };
    }

    private static IQueryable<Supplier> ApplySort(IQueryable<Supplier> q, string? sortBy, string? sortDir)
    {
        bool desc = string.Equals(sortDir, "desc", StringComparison.OrdinalIgnoreCase);
        return (sortBy?.ToUpperInvariant()) switch
        {
            "BALANCE" => desc ? q.OrderByDescending(s => s.CurrentBalance) : q.OrderBy(s => s.CurrentBalance),
            "CREATEDATUTC" or "CREATED" => desc
                ? q.OrderByDescending(s => s.CreatedAtUtc)
                : q.OrderBy(s => s.CreatedAtUtc),
            _ => desc ? q.OrderByDescending(s => s.Name) : q.OrderBy(s => s.Name),
        };
    }
}
