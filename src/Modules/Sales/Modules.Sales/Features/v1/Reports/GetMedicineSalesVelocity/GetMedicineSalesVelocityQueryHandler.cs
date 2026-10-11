using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Reports;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Reports.GetMedicineSalesVelocity;

public sealed class GetMedicineSalesVelocityQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetMedicineSalesVelocityQuery, IReadOnlyDictionary<Guid, decimal>>
{
    public async ValueTask<IReadOnlyDictionary<Guid, decimal>> Handle(
        GetMedicineSalesVelocityQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        if (query.MedicineIds.Count == 0)
        {
            return new Dictionary<Guid, decimal>();
        }

        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        if (branchId is null)
        {
            return new Dictionary<Guid, decimal>();
        }

        var sinceUtc = DateTime.UtcNow.AddDays(-query.WindowDays);

        var rows = await (
            from item in dbContext.SaleItems.AsNoTracking()
            join sale in dbContext.Sales.AsNoTracking() on item.SaleId equals sale.Id
            where query.MedicineIds.Contains(item.MedicineId)
                && sale.BranchId == branchId.Value
                && sale.Status == SaleStatus.Completed
                && sale.SaleDateUtc >= sinceUtc
            group item.Quantity by item.MedicineId into g
            select new { MedicineId = g.Key, UnitsSold = g.Sum() })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows.ToDictionary(r => r.MedicineId, r => r.UnitsSold);
    }
}
