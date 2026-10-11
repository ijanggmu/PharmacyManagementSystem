using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.MedicineCatalog;
using FSH.Modules.Inventory.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.MedicineCatalog.SearchNepalMedicineCatalog;

/// <summary>
/// Ported from `searchNepalMedicineCatalog` (lib/server/services/medicine-catalog-service.ts):
/// ilike on brand_name/generic_name once the query is at least 2 chars, ordered by brand name,
/// clamped to a max of 25 results.
/// </summary>
public sealed class SearchNepalMedicineCatalogQueryHandler(InventoryDbContext dbContext)
    : IQueryHandler<SearchNepalMedicineCatalogQuery, List<NepalMedicineCatalogEntryDto>>
{
    public async ValueTask<List<NepalMedicineCatalogEntryDto>> Handle(
        SearchNepalMedicineCatalogQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int limit = Math.Min(query.Limit <= 0 ? 10 : query.Limit, 25);
        var q = dbContext.NepalMedicineCatalogEntries.AsNoTracking();

        string term = query.Query?.Trim() ?? string.Empty;
        if (term.Length >= 2)
        {
            q = q.Where(e =>
                EF.Functions.ILike(e.BrandName, $"%{term}%") ||
                (e.GenericName != null && EF.Functions.ILike(e.GenericName, $"%{term}%")));
        }

        var entries = await q
            .OrderBy(e => e.BrandName)
            .Take(limit)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return entries
            .Select(e => new NepalMedicineCatalogEntryDto(
                e.Id, e.BrandName, e.GenericName, e.Form, e.Strength, e.Manufacturer,
                e.CategoryName, e.Dosage, e.UnitPrice, e.CostPrice, e.Description,
                e.SideEffects, e.StorageInstructions, e.PrescriptionRequired))
            .ToList();
    }
}
