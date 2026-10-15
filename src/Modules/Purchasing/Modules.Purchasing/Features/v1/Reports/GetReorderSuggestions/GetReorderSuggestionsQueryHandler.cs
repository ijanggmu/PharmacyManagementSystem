using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Contracts.v1.Reports;
using FSH.Modules.Sales.Contracts.v1.Reports;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;

namespace FSH.Modules.Purchasing.Features.v1.Reports.GetReorderSuggestions;

/// <summary>
/// Port of the legacy getReorderSuggestions. Medicine stock (current-branch SELLABLE on-hand — expired and recalled
/// lots don't count) comes from Inventory, supplier names from Suppliers and units sold from Sales (current branch,
/// 30-day window). A medicine is suggested when its sellable stock is at or below its reorder level, or when at the
/// current sales rate it would run out before a new order arrives. The quantity is Inventory's
/// <see cref="ReorderQuantity"/> rule (up to the maximum stock, else twice the reorder level, in whole packs) — the same
/// figure Inventory's reorder report shows — or, when only the sales rate triggered it, enough to cover the lead time.
/// The unit cost is the latest lot's cost (the medicine's own cost price is never updated by purchases). A medicine
/// without a preferred supplier, or whose supplier is inactive or gone, is still suggested with no supplier so it can
/// be added to an order for another one.
/// </summary>
public sealed class GetReorderSuggestionsQueryHandler(IMediator mediator)
    : IQueryHandler<GetPurchasingReorderSuggestionsQuery, IReadOnlyList<PurchasingReorderSuggestionDto>>
{
    /// <summary>Sales lookback window used for velocity (legacy SALES_LOOKBACK_DAYS).</summary>
    public const int SalesLookbackDays = 30;

    /// <summary>Assumed days between placing a PO and goods arriving (legacy DEFAULT_LEAD_TIME_DAYS).</summary>
    public const int LeadTimeDays = 7;

    private const int MedicinePageSize = 200;

    private sealed record Candidate(
        MedicineDto Medicine, decimal OnHand, decimal AverageDailySales, decimal? DaysOfStockLeft, decimal Quantity, string Reason);

    public async ValueTask<IReadOnlyList<PurchasingReorderSuggestionDto>> Handle(
        GetPurchasingReorderSuggestionsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var medicines = await LoadMedicinesAsync(cancellationToken).ConfigureAwait(false);
        if (medicines.Count == 0)
        {
            return [];
        }

        var soldByMedicine = await mediator.Send(
            new GetMedicineSalesVelocityQuery(medicines.Select(m => m.Id).ToList(), SalesLookbackDays),
            cancellationToken).ConfigureAwait(false);

        var candidates = new List<Candidate>();
        foreach (var m in medicines)
        {
            // Stock and velocity share one scope: the current branch. Only SELLABLE stock counts (expired and
            // quarantined lots can't cover demand), falling back to the physical figure for an Inventory that
            // doesn't report it.
            decimal onHand = m.BranchSellableQuantityOnHand ?? m.BranchQuantityOnHand ?? 0m;
            decimal soldQty = soldByMedicine.TryGetValue(m.Id, out var sold) ? sold : 0m;
            decimal avgDailySales = soldQty / SalesLookbackDays;
            decimal? daysOfStockLeft = avgDailySales > 0 ? onHand / avgDailySales : null;

            bool belowMinimum = onHand <= m.ReorderLevel;
            bool willStockOutBeforeResupply = daysOfStockLeft is not null && daysOfStockLeft < LeadTimeDays;
            if (!belowMinimum && !willStockOutBeforeResupply)
            {
                continue;
            }

            decimal suggestedQty = ReorderQuantity.Suggest(m.ReorderLevel, m.MaximumStock, onHand, m.UnitsPerPack);
            if (suggestedQty <= 0m && willStockOutBeforeResupply)
            {
                // Above the reorder target but selling fast: enough to cover the lead time.
                suggestedQty = ReorderQuantity.Suggest(0m, Math.Ceiling(avgDailySales * LeadTimeDays), onHand, m.UnitsPerPack);
            }

            if (suggestedQty <= 0m)
            {
                continue;
            }

            candidates.Add(new Candidate(m, onHand, avgDailySales, daysOfStockLeft, suggestedQty, ReasonFor(onHand, belowMinimum)));
        }

        if (candidates.Count == 0)
        {
            return [];
        }

        var latestCosts = await mediator.Send(
            new GetLatestLotPricesQuery(candidates.Select(c => c.Medicine.Id).ToList()), cancellationToken).ConfigureAwait(false);
        var supplierNames = await LoadActiveSupplierNamesAsync(
            candidates.Where(c => c.Medicine.SupplierId is not null).Select(c => c.Medicine.SupplierId!.Value), cancellationToken)
            .ConfigureAwait(false);

        return candidates
            .Select(c =>
            {
                var m = c.Medicine;
                string? supplierName = m.SupplierId is { } supplierId ? supplierNames.GetValueOrDefault(supplierId) : null;
                decimal unitCost = latestCosts is not null && latestCosts.TryGetValue(m.Id, out var latest) ? latest.CostPrice : m.CostPrice;
                return new PurchasingReorderSuggestionDto(
                    m.Id,
                    m.Name,
                    supplierName is null ? null : m.SupplierId,
                    supplierName,
                    unitCost,
                    c.OnHand,
                    m.ReorderLevel,
                    m.MaximumStock,
                    c.Quantity,
                    Math.Round(c.AverageDailySales, 2, MidpointRounding.AwayFromZero),
                    c.DaysOfStockLeft is null ? null : Math.Round(c.DaysOfStockLeft.Value, 1, MidpointRounding.AwayFromZero),
                    c.Reason);
            })
            .ToList();
    }

    private static string ReasonFor(decimal onHand, bool belowMinimum)
    {
        if (onHand == 0m)
        {
            return "out_of_stock";
        }

        return belowMinimum ? "below_minimum" : "will_stock_out_before_resupply";
    }

    /// <summary>Names of the ACTIVE suppliers among <paramref name="supplierIds"/>: an inactive supplier can't take a
    /// purchase order (SupplierGuard refuses it), and a deleted one is gone.</summary>
    private async Task<Dictionary<Guid, string>> LoadActiveSupplierNamesAsync(IEnumerable<Guid> supplierIds, CancellationToken cancellationToken)
    {
        var names = new Dictionary<Guid, string>();
        foreach (var supplierId in supplierIds.Distinct())
        {
            try
            {
                var supplier = await mediator.Send(new GetSupplierByIdQuery(supplierId), cancellationToken).ConfigureAwait(false);
                if (supplier.IsActive)
                {
                    names[supplierId] = supplier.Name;
                }
            }
            catch (NotFoundException)
            {
                // Supplier since deleted: the medicine is suggested without a supplier.
            }
        }

        return names;
    }

    /// <summary>Pages through Inventory's medicine search (page size is capped at 200 there).</summary>
    private async Task<List<MedicineDto>> LoadMedicinesAsync(CancellationToken cancellationToken)
    {
        var all = new List<MedicineDto>();
        int page = 1;
        while (true)
        {
            PagedResponse<MedicineDto> response = await mediator.Send(
                new SearchMedicinesQuery(PageNumber: page, PageSize: MedicinePageSize),
                cancellationToken).ConfigureAwait(false);

            all.AddRange(response.Items);
            if (page >= response.TotalPages || response.Items.Count == 0)
            {
                break;
            }

            page++;
        }

        return all;
    }
}
