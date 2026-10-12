using FSH.Framework.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Customers.LookupCustomers;

public sealed class LookupCustomersQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<LookupCustomersQuery, IReadOnlyList<CustomerLookupDto>>
{
    public async ValueTask<IReadOnlyList<CustomerLookupDto>> Handle(
        LookupCustomersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var ids = query.CustomerIds?.Where(id => id != Guid.Empty).Distinct().ToList();
        string? term = string.IsNullOrWhiteSpace(query.Search) ? null : query.Search.Trim();
        if ((ids is null || ids.Count == 0) && term is null)
        {
            return [];
        }

        int max = query.MaxResults is < 1 or > LookupCustomersQuery.MaxIds
            ? LookupCustomersQuery.DefaultMaxResults
            : query.MaxResults;

        // Trashed customers still own the sales they made; the tenant filter stays on.
        var q = dbContext.Customers.AsNoTracking().IgnoreQueryFilters([QueryFilters.SoftDelete]);

        if (ids is { Count: > 0 })
        {
            q = q.Where(c => ids.Contains(c.Id));
        }

        if (term is not null)
        {
            string pattern = $"%{EscapeLike(term)}%";
            q = q.Where(c =>
                EF.Functions.ILike(c.Name, pattern, @"\") ||
                (c.Phone != null && EF.Functions.ILike(c.Phone, pattern, @"\")));
        }

        return await q
            .OrderBy(c => c.Name)
            .Take(max)
            .Select(c => new CustomerLookupDto(c.Id, c.Name, c.Phone, c.Email))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }

    private static string EscapeLike(string value) =>
        value.Replace(@"\", @"\\", StringComparison.Ordinal)
            .Replace("%", @"\%", StringComparison.Ordinal)
            .Replace("_", @"\_", StringComparison.Ordinal);
}
