using FSH.Modules.Sales.Contracts.v1.Reports;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Reports.GetLastSaleDatesForMedicines;

public sealed class GetLastSaleDatesForMedicinesQueryHandler(SalesDbContext dbContext)
    : IQueryHandler<GetLastSaleDatesForMedicinesQuery, IReadOnlyDictionary<Guid, DateTime>>
{
    public async ValueTask<IReadOnlyDictionary<Guid, DateTime>> Handle(
        GetLastSaleDatesForMedicinesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        if (query.MedicineIds.Count == 0)
        {
            return new Dictionary<Guid, DateTime>();
        }

        var rows = await (
            from item in dbContext.SaleItems.AsNoTracking()
            join sale in dbContext.Sales.AsNoTracking() on item.SaleId equals sale.Id
            where query.MedicineIds.Contains(item.MedicineId) && sale.Status == SaleStatus.Completed
                // Optional: only sales at this branch (dead stock is judged per branch). Callers pass an
                // already-authorized branch id; null = every branch.
                && (query.BranchId == null || sale.BranchId == query.BranchId)
            group sale.SaleDateUtc by item.MedicineId into g
            select new { MedicineId = g.Key, LastSoldAtUtc = g.Max() })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows.ToDictionary(r => r.MedicineId, r => r.LastSoldAtUtc);
    }
}
