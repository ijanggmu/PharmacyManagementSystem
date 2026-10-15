using System.Data;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Consignment.ReceiveConsignmentStock;

/// <summary>
/// Receives consigned stock (owned by the supplier until sold) as its OWN lot. Settlement bills what
/// was sold from that lot, so it must never be merged into a lot the pharmacy already owns: a batch
/// number that is already live for this medicine at this branch is rejected (409) instead of topping
/// that lot up. The lot and its consignment position commit together.
/// </summary>
public sealed class ReceiveConsignmentStockCommandHandler(
    InventoryDbContext dbContext,
    IStockReceiptService stockReceiptService,
    ICurrentBranch currentBranch) : ICommandHandler<ReceiveConsignmentStockCommand, Guid>
{
    public async ValueTask<Guid> Handle(ReceiveConsignmentStockCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Nullable — ConsignmentPosition is a ledger/reporting entity (docs/branch-scoping-plan.md),
        // persisted null when the tenant has no branches configured.
        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        Guid stockBranchId = branchId ?? await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        // An unknown medicine is a 404, not a foreign-key violation (500) when the lot is inserted.
        var medicine = await dbContext.Medicines.AsNoTracking()
            .Where(m => m.Id == command.MedicineId)
            .Select(m => new { m.UnitPrice })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Medicine {command.MedicineId} not found.");

        StockReceiptRules.EnsureNotExpired(command.ExpiryDate, NepalClock.Today(), "This consignment");

        // Optional inputs fall back to the legacy defaults: a generated batch number, no expiry, and
        // the medicine's default unit price as the selling price.
        decimal sellingPrice = command.SellingPrice ?? medicine.UnitPrice;

        string batchNo = MedicineBatch.NormalizeBatchNo(string.IsNullOrWhiteSpace(command.BatchNo)
            ? $"CONSIGN-{Guid.CreateVersion7():N}"
            : command.BatchNo);

#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
        bool lotExists = await dbContext.MedicineBatches
            .AnyAsync(
                b => b.MedicineId == command.MedicineId && b.BranchId == stockBranchId && !b.IsDisposed
                    && b.BatchNo.ToUpper() == batchNo,
                cancellationToken)
            .ConfigureAwait(false);
#pragma warning restore CA1304, CA1311, CA1862
        if (lotExists)
        {
            throw new CustomException(
                $"Batch {batchNo} is already in stock for this medicine at this branch. Consigned stock is kept as its own lot so settlement bills only what was sold from it — use a distinct batch number (or leave it blank to generate one).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var results = await stockReceiptService.ReceiveAsync(
            new StockReceiptRequest(
                ReferenceType: "Consignment",
                ReferenceId: command.SupplierId,
                Lines:
                [
                    new StockReceiptLine(
                        command.MedicineId, batchNo, command.ExpiryDate ?? MedicineBatch.NoExpiryDate, command.Quantity,
                        command.UnitCostPrice, sellingPrice, command.RackLocation),
                ],
                BranchId: stockBranchId),
            cancellationToken).ConfigureAwait(false);

        var receipt = results[0];

        var position = ConsignmentPosition.Create(
            command.SupplierId, command.MedicineId, receipt.BatchId, receipt.BatchNo,
            receipt.QuantityReceived, command.UnitCostPrice, DateTime.UtcNow, branchId);

        dbContext.ConsignmentPositions.Add(position);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);

        return position.Id;
    }
}
