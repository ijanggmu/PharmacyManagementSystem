using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Batches.UpdateBatchSellingPrice;

public sealed class UpdateBatchSellingPriceCommandHandler(InventoryDbContext dbContext)
    : ICommandHandler<UpdateBatchSellingPriceCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateBatchSellingPriceCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var batch = await dbContext.MedicineBatches
            .FirstOrDefaultAsync(b => b.Id == command.BatchId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Batch {command.BatchId} not found.");

        batch.ChangeSellingPrice(command.SellingPrice);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return batch.Id;
    }
}
