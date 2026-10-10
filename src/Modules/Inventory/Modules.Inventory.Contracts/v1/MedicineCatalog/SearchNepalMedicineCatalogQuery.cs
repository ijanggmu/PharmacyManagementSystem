using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.MedicineCatalog;

/// <summary>
/// Ported from app/api/medicine-catalog/nepal/route.ts (`parseSearchNepalCatalogInput` +
/// `searchNepalMedicineCatalog`). Not paginated — a plain top-N suggestion lookup, same as the
/// source route.
/// </summary>
public sealed record SearchNepalMedicineCatalogQuery(
    string? Query = null,
    int Limit = 10) : IQuery<List<NepalMedicineCatalogEntryDto>>;
