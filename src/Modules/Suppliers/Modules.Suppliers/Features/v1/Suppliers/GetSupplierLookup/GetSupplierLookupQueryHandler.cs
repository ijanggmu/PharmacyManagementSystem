using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.GetSupplierLookup;

public sealed class GetSupplierLookupQueryHandler(SuppliersDbContext dbContext)
    : IQueryHandler<GetSupplierLookupQuery, IReadOnlyList<SupplierLookupDto>>
{
    public async ValueTask<IReadOnlyList<SupplierLookupDto>> Handle(GetSupplierLookupQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var q = dbContext.Suppliers.AsNoTracking();
        int limit = query.Limit is < 1 or > GetSupplierLookupQuery.MaxLimit ? GetSupplierLookupQuery.DefaultLimit : query.Limit;

        if (query.Ids is { Count: > 0 } ids)
        {
            var idSet = ids.Distinct().ToList();
            q = q.Where(s => idSet.Contains(s.Id));
            limit = Math.Max(limit, idSet.Count);
        }
        else if (!query.IncludeInactive)
        {
            q = q.Where(s => s.IsActive);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // Upper-cased contains rather than ILIKE: EF translates it to SQL upper() on Npgsql and it also runs
            // on the in-memory provider. The culture/comparison overloads the analyzers ask for do not translate.
            string term = query.Search.Trim().ToUpperInvariant();
#pragma warning disable CA1304, CA1311, CA1862
            q = q.Where(s => s.Name.ToUpper().Contains(term) || (s.Phone != null && s.Phone.ToUpper().Contains(term)));
#pragma warning restore CA1304, CA1311, CA1862
        }

        return await q
            .OrderBy(s => s.Name)
            .ThenBy(s => s.Id)
            .Take(limit)
            .Select(s => new SupplierLookupDto(s.Id, s.Name, s.Phone, s.IsActive, s.CreditDays))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}
