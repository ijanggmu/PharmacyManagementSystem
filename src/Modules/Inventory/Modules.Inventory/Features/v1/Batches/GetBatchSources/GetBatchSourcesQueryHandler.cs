using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Batches.GetBatchSources;

/// <summary>In-process: lot details plus the receipts that put stock into each lot (see <see cref="GetBatchSourcesQuery"/>).</summary>
public sealed class GetBatchSourcesQueryHandler(InventoryDbContext dbContext)
    : IQueryHandler<GetBatchSourcesQuery, IReadOnlyList<BatchSourceDto>>
{
    public async ValueTask<IReadOnlyList<BatchSourceDto>> Handle(GetBatchSourcesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var ids = query.BatchIds.Distinct().ToList();
        if (ids.Count == 0)
        {
            return [];
        }

        var lots = await (
            from b in dbContext.MedicineBatches.AsNoTracking()
            join m in dbContext.Medicines.AsNoTracking() on b.MedicineId equals m.Id
            where ids.Contains(b.Id)
            select new { Batch = b, m.Name, m.Strength, m.SupplierId })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        Guid?[] nullableIds = ids.Select(id => (Guid?)id).ToArray();
        var receipts = await dbContext.InventoryTransactions.AsNoTracking()
            .Where(t => nullableIds.Contains(t.MedicineBatchId) && t.Type == InventoryTransactionType.Purchase && t.ReferenceId != null)
            .OrderBy(t => t.CreatedAtUtc)
            .Select(t => new { BatchId = t.MedicineBatchId!.Value, ReferenceId = t.ReferenceId!.Value })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var receiptsByLot = receipts
            .GroupBy(r => r.BatchId)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<Guid>)g.Select(r => r.ReferenceId).Distinct().ToList());

        var consigned = await ConsignedStock.ConsignedAmongAsync(dbContext, ids, cancellationToken).ConfigureAwait(false);

        return lots
            .Select(x => new BatchSourceDto(
                x.Batch.Id, x.Batch.MedicineId,
                string.Join(' ', new[] { x.Name, x.Strength }.Where(s => !string.IsNullOrWhiteSpace(s))),
                x.Batch.BatchNo, x.Batch.ExpiryDate, x.Batch.QuantityOnHand, x.Batch.CostPrice, x.Batch.BranchId,
                x.Batch.IsDisposed, consigned.Contains(x.Batch.Id), x.SupplierId,
                receiptsByLot.TryGetValue(x.Batch.Id, out var refs) ? refs : []))
            .ToList();
    }
}
