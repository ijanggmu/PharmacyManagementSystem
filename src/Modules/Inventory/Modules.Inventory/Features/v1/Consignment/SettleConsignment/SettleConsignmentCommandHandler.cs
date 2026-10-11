using System.Data;
using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Consignment.SettleConsignment;

/// <summary>
/// Settles a supplier's open consignment positions at the caller's branch: bills what was actually
/// SOLD from each consigned lot since the last settlement, marks it settled, and publishes
/// <see cref="ConsignmentSettledIntegrationEvent"/> so Suppliers (AP ledger) and Accounting (AP voucher)
/// post — all in one transaction (the outbox joins it).
///
/// Sold is counted from the inventory ledger, not inferred from what is missing: the lot's sale
/// draws (<see cref="InventoryTransactionType.Sale"/> rows referencing a sale) minus stock put back into
/// it by cancellations and returns (<see cref="InventoryTransactionType.SaleReversal"/>). Expired lots
/// written off, count shortfalls, supplier returns and transfers are not sales, so they are never billed.
/// The positions are locked (<c>FOR UPDATE</c>) and re-read first, so two concurrent settlements cannot
/// both bill the same units.
/// </summary>
public sealed class SettleConsignmentCommandHandler(
    InventoryDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<SettleConsignmentCommand, Guid>
{
    private const string SaleReferenceType = "Sale";

    public async ValueTask<Guid> Handle(SettleConsignmentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Nullable — ConsignmentSettlement is a ledger/reporting entity (docs/branch-scoping-plan.md).
        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        // This branch's positions only (tenant-wide/legacy positions with no branch stay settleable).
        var positionIds = await dbContext.ConsignmentPositions.AsNoTracking()
            .Where(p => p.SupplierId == command.SupplierId
                && (branchId == null || p.BranchId == branchId || p.BranchId == null))
            .Select(p => p.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var positions = await InventoryRowLocks.LockConsignmentPositionsAsync(dbContext, positionIds, cancellationToken)
            .ConfigureAwait(false);

        if (positions.Count == 0)
        {
            throw new NotFoundException($"No consignment positions found for supplier {command.SupplierId}.");
        }

        var soldByBatch = await SoldFromBatchesAsync(positions.Select(p => p.BatchId).Distinct().ToList(), cancellationToken)
            .ConfigureAwait(false);

        decimal totalAmount = 0m;
        int settledCount = 0;
        foreach (var position in positions)
        {
            decimal soldToDate = Math.Min(position.QuantityReceived, soldByBatch.GetValueOrDefault(position.BatchId));
            decimal newlySold = soldToDate - position.SettledQuantity;
            if (newlySold <= 0)
            {
                continue;
            }

            position.MarkSettled(newlySold);
            totalAmount += newlySold * position.UnitCostPrice;
            settledCount++;
        }

        if (settledCount == 0)
        {
            throw new CustomException(
                $"Nothing owed for supplier {command.SupplierId} — no consigned stock sold since the last settlement.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var settlementDateUtc = command.SettlementDateUtc ?? DateTime.UtcNow;
        var settlement = ConsignmentSettlement.Create(
            command.SupplierId, totalAmount, settledCount, settlementDateUtc,
            currentUser.Name ?? currentUser.GetUserId().ToString(), branchId);

        dbContext.ConsignmentSettlements.Add(settlement);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        var correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
        await outbox.AddAsync(new ConsignmentSettledIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: correlationId,
            Source: "Inventory",
            SettlementId: settlement.Id,
            SupplierId: command.SupplierId,
            TotalAmount: totalAmount,
            SettlementDateUtc: settlementDateUtc,
            BranchId: branchId),
            cancellationToken).ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return settlement.Id;
    }

    /// <summary>Net units sold from each lot: sale draws minus units put back by cancellations/returns.</summary>
    private async Task<Dictionary<Guid, decimal>> SoldFromBatchesAsync(List<Guid> batchIds, CancellationToken cancellationToken)
    {
        var movements = await dbContext.InventoryTransactions.AsNoTracking()
            .Where(t => t.MedicineBatchId != null && batchIds.Contains(t.MedicineBatchId.Value)
                && ((t.Type == InventoryTransactionType.Sale && t.ReferenceType == SaleReferenceType)
                    || t.Type == InventoryTransactionType.SaleReversal))
            .GroupBy(t => t.MedicineBatchId!.Value)
            .Select(g => new { BatchId = g.Key, NetDelta = g.Sum(t => t.QuantityDelta) })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Sale draws are negative and restocks positive, so sold = -(net), never below zero.
        return movements.ToDictionary(m => m.BatchId, m => Math.Max(0m, -m.NetDelta));
    }
}
