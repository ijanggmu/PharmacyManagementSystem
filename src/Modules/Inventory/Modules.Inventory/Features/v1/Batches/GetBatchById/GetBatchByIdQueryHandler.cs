using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Batches.GetBatchById;

public sealed class GetBatchByIdQueryHandler(InventoryDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetBatchByIdQuery, MedicineBatchDto>
{
    public async ValueTask<MedicineBatchDto> Handle(GetBatchByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var row = await (
            from b in dbContext.MedicineBatches.AsNoTracking()
            join m in dbContext.Medicines.AsNoTracking() on b.MedicineId equals m.Id
            where b.Id == query.BatchId
            select new { Batch = b, MedicineName = m.Name })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Batch {query.BatchId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(row.Batch.BranchId, $"Batch {query.BatchId} not found.", cancellationToken).ConfigureAwait(false);

        var branchNames = await BatchBranchNameResolver
            .ResolveAsync(mediator, [row.Batch.BranchId], cancellationToken)
            .ConfigureAwait(false);

        var batch = row.Batch;
        return new MedicineBatchDto(
            batch.Id, batch.MedicineId, row.MedicineName, batch.BranchId, batch.BatchNo, batch.ExpiryDate, batch.QuantityOnHand,
            batch.CostPrice, batch.SellingPrice, batch.RackLocation, batch.IsDisposed, batch.CreatedAtUtc, batch.UpdatedAtUtc,
            batch.IsRecalled, batch.RecalledAtUtc, batch.RecallReason,
            branchNames.TryGetValue(batch.BranchId, out var branchName) ? branchName : null,
            batch.InitialQuantity ?? batch.QuantityOnHand);
    }
}
