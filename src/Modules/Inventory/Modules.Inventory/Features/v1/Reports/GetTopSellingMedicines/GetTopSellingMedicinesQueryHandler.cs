using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Sales.Contracts.v1.Reports;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetTopSellingMedicines;

/// <summary>Composes Sales' per-medicine aggregate (via Mediator, same pattern as Purchasing's reorder
/// suggestions) with Inventory's own medicine names, ranked by quantity sold.</summary>
public sealed class GetTopSellingMedicinesQueryHandler(InventoryDbContext dbContext, IMediator mediator)
    : IQueryHandler<GetTopSellingMedicinesQuery, IReadOnlyList<TopSellingMedicineDto>>
{
    public async ValueTask<IReadOnlyList<TopSellingMedicineDto>> Handle(
        GetTopSellingMedicinesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var aggregate = await mediator.Send(
            new GetMedicineSalesAggregateQuery(query.FromUtc, query.ToUtc, query.BranchId), cancellationToken).ConfigureAwait(false);
        if (aggregate.Count == 0)
        {
            return [];
        }

        var ids = aggregate.Keys.ToList();
        var names = await dbContext.Medicines.AsNoTracking()
            .Where(m => ids.Contains(m.Id))
            .Select(m => new { m.Id, m.Name })
            .ToDictionaryAsync(m => m.Id, m => m.Name, cancellationToken)
            .ConfigureAwait(false);

        int take = Math.Clamp(query.Take, 1, 100);

        return aggregate
            .Where(kvp => names.ContainsKey(kvp.Key))
            .Select(kvp => new TopSellingMedicineDto(kvp.Key, names[kvp.Key], kvp.Value.Quantity, kvp.Value.Revenue))
            .OrderByDescending(d => d.Quantity)
            .ThenByDescending(d => d.Revenue)
            .Take(take)
            .ToList();
    }
}
