using FSH.Framework.Shared.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Customers.SearchCustomers;

public sealed class SearchCustomersQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<SearchCustomersQuery, PagedResponse<CustomerDto>>
{
    public async ValueTask<PagedResponse<CustomerDto>> Handle(SearchCustomersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.Customers.AsNoTracking().AsQueryable();

        if (query.IsActive is { } isActive)
        {
            q = q.Where(c => c.IsActive == isActive);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string term = query.Search.Trim();
            q = q.Where(c =>
                EF.Functions.ILike(c.Name, $"%{term}%") ||
                EF.Functions.ILike(c.Code, $"%{term}%") ||
                (c.Phone != null && EF.Functions.ILike(c.Phone, $"%{term}%")) ||
                (c.Email != null && EF.Functions.ILike(c.Email, $"%{term}%")));
        }

        q = ApplySort(q, query.SortBy, query.SortDir);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var customers = await q
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<CustomerDto>
        {
            Items = customers
                .Select(c => c.ToDto())
                .ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size)
        };
    }

    private static IQueryable<Customer> ApplySort(IQueryable<Customer> q, string? sortBy, string? sortDir)
    {
        bool desc = string.Equals(sortDir, "desc", StringComparison.OrdinalIgnoreCase);
        return (sortBy?.ToUpperInvariant()) switch
        {
            "BALANCE" => desc ? q.OrderByDescending(c => c.CurrentBalance) : q.OrderBy(c => c.CurrentBalance),
            "CREATEDATUTC" or "CREATED" => desc
                ? q.OrderByDescending(c => c.CreatedAtUtc)
                : q.OrderBy(c => c.CreatedAtUtc),
            _ => desc ? q.OrderByDescending(c => c.Name) : q.OrderBy(c => c.Name),
        };
    }
}
