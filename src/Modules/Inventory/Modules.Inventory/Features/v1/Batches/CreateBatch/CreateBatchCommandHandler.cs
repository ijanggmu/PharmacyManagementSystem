using System.Data;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Batches.CreateBatch;

public sealed class CreateBatchCommandHandler(
    InventoryDbContext dbContext,
    ICurrentBranch currentBranch,
    IOutboxWriter outbox,
    ICurrentUser currentUser)
    : ICommandHandler<CreateBatchCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateBatchCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var medicine = await dbContext.Medicines
            .Where(m => m.Id == command.MedicineId)
            .Select(m => new { m.UnitPrice, m.IsTaxable })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Medicine {command.MedicineId} not found.");

        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        // Live batch numbers are unique per medicine per branch (DB index); say so instead of
        // surfacing the unique-violation as a server error.
        string batchNo = MedicineBatch.NormalizeBatchNo(command.BatchNo);
#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
        bool batchExists = await dbContext.MedicineBatches
            .AnyAsync(
                b => b.MedicineId == command.MedicineId && b.BranchId == branchId
                    && b.BatchNo.ToUpper() == batchNo && !b.IsDisposed,
                cancellationToken)
            .ConfigureAwait(false);
#pragma warning restore CA1304, CA1311, CA1862
        if (batchExists)
        {
            throw new CustomException(
                $"Batch {batchNo} already exists for this medicine at this branch. Adjust its quantity or receive stock against it instead.",
                (IEnumerable<string>?)null, System.Net.HttpStatusCode.Conflict);
        }

        var batch = MedicineBatch.Create(
            command.MedicineId, branchId, command.BatchNo, command.ExpiryDate, command.Quantity,
            // No price given: the lot starts at the medicine's price, never at 0.
            command.CostPrice, command.SellingPrice > 0m ? command.SellingPrice : medicine.UnitPrice, command.RackLocation, medicine.IsTaxable);

        dbContext.MedicineBatches.Add(batch);

        if (command.Quantity > 0)
        {
            dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                command.MedicineId, branchId, batch.Id, InventoryTransactionType.Adjustment, command.Quantity,
                command.CostPrice, notes: "Initial batch entry"));
        }

        // A batch entered by hand carries no supplier bill, so its value posts as opening stock
        // (Dr Inventory / Cr Owner's Equity), committed together with the batch.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        await OpeningStockPublisher.PublishAsync(
            outbox, currentUser, command.Quantity * command.CostPrice, $"Opening stock: batch {batch.BatchNo}", branchId,
            cancellationToken).ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return batch.Id;
    }
}
