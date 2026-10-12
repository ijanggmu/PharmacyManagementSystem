using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Consignment.SettleConsignment;

/// <summary>
/// Settles every open consignment position for a supplier: computes quantity sold since the last
/// settlement per position — from the batch's own sale movements (sales out, minus sales reversed back in),
/// never from "received minus on hand", which would bill the supplier for consigned stock that expired, was
/// written off, adjusted, transferred or returned rather than sold — marks
/// it settled, commits locally, then publishes <see cref="ConsignmentSettledIntegrationEvent"/> so
/// Suppliers (AP ledger) and Accounting (AP voucher) post asynchronously — mirrors
/// <c>ReceivePurchaseOrderCommandHandler</c>'s pattern (pharmacy-modules-plan.md §2).
/// </summary>
public sealed class SettleConsignmentCommandHandler(
    InventoryDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<SettleConsignmentCommand, Guid>
{
    public async ValueTask<Guid> Handle(SettleConsignmentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Nullable — ConsignmentSettlement is a ledger/reporting entity (docs/branch-scoping-plan.md).
        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var positions = await dbContext.ConsignmentPositions
            .Where(p => p.SupplierId == command.SupplierId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (positions.Count == 0)
        {
            throw new NotFoundException($"No consignment positions found for supplier {command.SupplierId}.");
        }

        var batchIds = positions.Select(p => p.BatchId).ToList();
        // Net units sold out of each consigned batch: sale movements are negative, a cancelled or returned sale
        // restocked into the same batch is a positive SaleReversal.
        var soldByBatch = await dbContext.InventoryTransactions.AsNoTracking()
            .Where(t => t.MedicineBatchId != null && batchIds.Contains(t.MedicineBatchId.Value)
                && (t.Type == InventoryTransactionType.Sale || t.Type == InventoryTransactionType.SaleReversal))
            .GroupBy(t => t.MedicineBatchId!.Value)
            .Select(g => new { BatchId = g.Key, Sold = -g.Sum(t => t.QuantityDelta) })
            .ToDictionaryAsync(x => x.BatchId, x => x.Sold, cancellationToken)
            .ConfigureAwait(false);

        decimal totalAmount = 0m;
        int settledCount = 0;
        foreach (var position in positions)
        {
            decimal soldToDate = Math.Min(position.QuantityReceived, Math.Max(0m, soldByBatch.GetValueOrDefault(position.BatchId)));
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

        return settlement.Id;
    }
}
