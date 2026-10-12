using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Contracts.v1.Reports;
using FSH.Modules.Sales.Contracts.v1.Reports;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;

namespace FSH.Modules.Purchasing.Features.v1.Reports.GetReorderSuggestions;

/// <summary>
/// Port of the legacy getReorderSuggestions. Medicine stock (current-branch on-hand) and cost come from
/// Inventory (sellable stock — expired lots don't count), supplier names from Suppliers (inactive suppliers are skipped), and units sold from Sales (current branch, 30-day window). Medicines without a supplier
/// or whose supplier cannot be found are skipped, as the legacy inner join did.
/// </summary>
public sealed class GetReorderSuggestionsQueryHandler(IMediator mediator)
    : IQueryHandler<GetPurchasingReorderSuggestionsQuery, IReadOnlyList<PurchasingReorderSuggestionDto>>
{
    /// <summary>Sales lookback window used for velocity (legacy SALES_LOOKBACK_DAYS).</summary>
    public const int SalesLookbackDays = 30;

    /// <summary>Assumed days between placing a PO and goods arriving (legacy DEFAULT_LEAD_TIME_DAYS).</summary>
    public const int LeadTimeDays = 7;

    private const int MedicinePageSize = 200;

    public async ValueTask<IReadOnlyList<PurchasingReorderSuggestionDto>> Handle(
        GetPurchasingReorderSuggestionsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var medicines = (await LoadMedicinesAsync(cancellationToken).ConfigureAwait(false))
            .Where(m => m.SupplierId is not null)
            .ToList();
        if (medicines.Count == 0)
        {
            return [];
        }

        var soldByMedicine = await mediator.Send(
            new GetMedicineSalesVelocityQuery(medicines.Select(m => m.Id).ToList(), SalesLookbackDays),
            cancellationToken).ConfigureAwait(false);

        var supplierNames = new Dictionary<Guid, string>();
        foreach (var supplierId in medicines.Select(m => m.SupplierId!.Value).Distinct())
        {
            try
            {
                var supplier = await mediator.Send(new GetSupplierByIdQuery(supplierId), cancellationToken)
                    .ConfigureAwait(false);

                // An inactive supplier can't take a purchase order (SupplierGuard refuses it), so don't
                // suggest ordering from one.
                if (supplier.IsActive)
                {
                    supplierNames[supplierId] = supplier.Name;
                }
            }
            catch (NotFoundException)
            {
                // Legacy inner join: a medicine whose supplier no longer exists is not suggested.
            }
        }

        var result = new List<PurchasingReorderSuggestionDto>();
        foreach (var m in medicines)
        {
            if (!supplierNames.TryGetValue(m.SupplierId!.Value, out var supplierName))
            {
                continue;
            }

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

            decimal thresholdQty = Math.Max(0m, (m.MaximumStock ?? 0m) - onHand);
            decimal velocityQty = Math.Ceiling(avgDailySales * LeadTimeDays) - onHand;
            decimal suggestedQty = Math.Max(1m, Math.Max(Math.Ceiling(thresholdQty), velocityQty));

            string reason;
            if (onHand == 0m)
            {
                reason = "out_of_stock";
            }
            else if (belowMinimum)
            {
                reason = "below_minimum";
            }
            else
            {
                reason = "will_stock_out_before_resupply";
            }

            result.Add(new PurchasingReorderSuggestionDto(
                m.Id,
                m.Name,
                m.SupplierId!.Value,
                supplierName,
                m.CostPrice,
                onHand,
                m.ReorderLevel,
                m.MaximumStock,
                suggestedQty,
                Math.Round(avgDailySales, 2, MidpointRounding.AwayFromZero),
                daysOfStockLeft is null ? null : Math.Round(daysOfStockLeft.Value, 1, MidpointRounding.AwayFromZero),
                reason));
        }

        return result;
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
