using FSH.Framework.Shared.Persistence;
using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.PriceLists;

/// <summary>
/// Creates (no <paramref name="ItemId"/>) or updates one price-list row of an active supplier. Prices are per base
/// unit. Only one active row may start on the same <paramref name="ValidFrom"/> for the supplier and medicine (409).
/// Returns the row id.
/// </summary>
public sealed record UpsertSupplierPriceListItemCommand(
    Guid SupplierId,
    Guid MedicineId,
    decimal UnitCost,
    DateOnly ValidFrom,
    DateOnly? ValidTo = null,
    decimal? MinOrderQuantity = null,
    string? Notes = null,
    Guid? ItemId = null) : ICommand<Guid>;

/// <summary>Deactivates a price-list row (kept for history; no longer used to prefill orders).</summary>
public sealed record DeleteSupplierPriceListItemCommand(Guid SupplierId, Guid ItemId) : ICommand<Unit>;

/// <summary>
/// Paged price-list rows, by supplier and/or medicine. <paramref name="ActiveOn"/> keeps only the rows whose window
/// covers that date; inactive (removed) rows are left out unless <paramref name="IncludeInactive"/>.
/// </summary>
public sealed record SearchSupplierPriceListQuery(
    Guid? SupplierId = null,
    Guid? MedicineId = null,
    DateOnly? ActiveOn = null,
    bool IncludeInactive = false,
    int PageNumber = 1,
    int PageSize = 50) : IQuery<PagedResponse<SupplierPriceListItemDto>>;

/// <summary>
/// Cross-module (and lookup endpoint): the supplier's price valid on <paramref name="AsOf"/> for each of
/// <paramref name="MedicineIds"/> — the active row with the latest ValidFrom on or before AsOf whose ValidTo is
/// open or on/after AsOf. Medicines without a price are absent from the result.
/// </summary>
public sealed record GetSupplierPricesQuery(Guid SupplierId, IReadOnlyList<Guid> MedicineIds, DateOnly AsOf)
    : IQuery<IReadOnlyList<SupplierPriceDto>>
{
    public const int MaxMedicineIds = 500;
}
