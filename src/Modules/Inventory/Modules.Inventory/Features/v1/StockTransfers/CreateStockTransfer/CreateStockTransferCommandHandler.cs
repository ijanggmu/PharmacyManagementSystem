using System.Data;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.CreateStockTransfer;

/// <summary>
/// Dispatch leg of a branch-to-branch transfer. Each branch is one stock location, so the source is the
/// caller's current branch (the client's <c>FromBranchId</c> must match it) and the destination is an
/// active branch of the current tenant. Stock is drawn FEFO from the source branch's live batches under
/// row locks, and each draw is recorded as a <see cref="StockTransferBatch"/> so receive can recreate the
/// same lot at the destination. Everything commits in one transaction; the transfer stays
/// <see cref="StockTransferStatus.InTransit"/> until received or cancelled.
/// </summary>
public sealed class CreateStockTransferCommandHandler(
    InventoryDbContext dbContext,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IBranchService branchService,
    IStockDeductionService stockDeductionService)
    : ICommandHandler<CreateStockTransferCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateStockTransferCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        Guid sourceBranchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        if (command.FromBranchId != sourceBranchId)
        {
            throw new ForbiddenException("A stock transfer can only be dispatched from the current branch.");
        }

        if (!await branchService.IsActiveBranchOfCurrentTenantAsync(command.ToBranchId, cancellationToken).ConfigureAwait(false))
        {
            throw new NotFoundException($"Destination branch {command.ToBranchId} was not found or is inactive.");
        }

        var lines = command.Items.Select(i => (i.MedicineId, i.Quantity)).ToList();

        // Built detached so its id can serve as the deduction's reference id. It is added once the stock is held.
        var transfer = StockTransfer.Create(
            sourceBranchId, command.ToBranchId, currentUser.GetUserId(), command.Notes, lines);

        // The row locks taken by the FEFO deduction must be held until the transfer rows commit, so the
        // deduction joins this transaction rather than opening its own.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        // All-or-nothing across every line: throws InsufficientStockException before any batch changes.
        var deductions = await stockDeductionService.DeductForTransferAsync(
            new StockDeductionRequest(
                ReferenceType: "StockTransfer",
                ReferenceId: transfer.Id,
                Lines: command.Items.Select(i => new StockDeductionLine(i.MedicineId, i.Quantity)).ToList()),
            cancellationToken).ConfigureAwait(false);

        var batchIds = deductions.SelectMany(d => d.Batches).Select(b => b.BatchId).Distinct().ToArray();
        var sourceBatches = await dbContext.MedicineBatches
            .Where(b => batchIds.Contains(b.Id))
            .ToDictionaryAsync(b => b.Id, cancellationToken)
            .ConfigureAwait(false);

        foreach (var line in deductions)
        {
            foreach (var detail in line.Batches)
            {
                var source = sourceBatches[detail.BatchId];
                dbContext.StockTransferBatches.Add(StockTransferBatch.Create(
                    transfer.Id, line.MedicineId, source.Id, source.BatchNo, source.ExpiryDate,
                    detail.QuantityDeducted, source.CostPrice, source.SellingPrice));
            }
        }

        dbContext.StockTransfers.Add(transfer);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return transfer.Id;
    }
}
