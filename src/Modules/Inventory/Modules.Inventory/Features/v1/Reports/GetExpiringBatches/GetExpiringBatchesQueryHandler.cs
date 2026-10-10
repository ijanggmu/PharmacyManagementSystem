using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetExpiringBatches;

public sealed class GetExpiringBatchesQueryHandler(InventoryDbContext dbContext, TimeProvider timeProvider, ICurrentBranch currentBranch)
    : IQueryHandler<GetExpiringBatchesQuery, IReadOnlyList<ExpiringBatchDto>>
{
    public async ValueTask<IReadOnlyList<ExpiringBatchDto>> Handle(GetExpiringBatchesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);
        var horizon = today.AddDays(query.WithinDays);
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var batches = await (
            from b in dbContext.MedicineBatches.AsNoTracking()
            join m in dbContext.Medicines.AsNoTracking() on b.MedicineId equals m.Id
            where !b.IsDisposed && b.QuantityOnHand > 0 && b.ExpiryDate <= horizon
                && (branchId == null || b.BranchId == branchId)
            orderby b.ExpiryDate
            select new { Batch = b, MedicineName = m.Name })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return batches
            .Select(x => new ExpiringBatchDto(
                x.Batch.Id, x.Batch.MedicineId, x.MedicineName, x.Batch.BatchNo, x.Batch.ExpiryDate,
                x.Batch.ExpiryDate.DayNumber - today.DayNumber, x.Batch.QuantityOnHand, x.Batch.BranchId))
            .ToList();
    }
}
