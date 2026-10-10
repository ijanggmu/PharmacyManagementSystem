using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.RecallMedicineBatch;

/// <summary>
/// Product recall by batch number. Every not-yet-disposed lot with the given batch number for this
/// medicine is flagged <c>IsRecalled</c> across all branches. Quantities are NOT written off: stock stays
/// on record (for return to supplier or investigation) but is excluded from sale deduction and sale pricing.
/// Each newly recalled lot gets a zero-quantity <see cref="InventoryTransactionType.Recall"/> ledger entry for audit.
/// Already-recalled lots keep their original recall timestamp and reason and get no second ledger entry.
/// </summary>
public sealed class RecallMedicineBatchCommandHandler(InventoryDbContext dbContext, TimeProvider timeProvider)
    : ICommandHandler<RecallMedicineBatchCommand, RecallMedicineBatchResult>
{
    public async ValueTask<RecallMedicineBatchResult> Handle(
        RecallMedicineBatchCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var batches = await dbContext.MedicineBatches
            .Where(b => b.MedicineId == command.MedicineId && b.BatchNo == command.BatchNumber && !b.IsDisposed)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (batches.Count == 0)
        {
            throw new NotFoundException("No active batch rows found for that batch number.");
        }

        string? notes = string.IsNullOrWhiteSpace(command.Reason)
            ? "Batch recall"
            : $"Batch recall: {command.Reason.Trim()}";
        var recalledAtUtc = timeProvider.GetUtcNow().UtcDateTime;

        foreach (var batch in batches)
        {
            if (!batch.Recall(command.Reason, recalledAtUtc))
            {
                continue;
            }

            dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                batch.MedicineId, batch.BranchId, batch.Id, InventoryTransactionType.Recall, 0m,
                batch.CostPrice, referenceType: "recall", notes: notes));
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return new RecallMedicineBatchResult(batches.Count);
    }
}
