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
using FSH.Modules.Reference.Contracts.v1.Settings;
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
///
/// VAT: the settlement is the supplier's bill for those units. When it is a VAT bill
/// (<see cref="SettleConsignmentCommand.SupplierChargesVat"/>), input VAT is charged on the lots bought as
/// VAT-able (<see cref="MedicineBatch.IsTaxable"/>) at the pharmacy's rate, per position, the same way a
/// supplier return reverses it — so Accounting can post Dr Inventory (net) + Dr Input VAT / Cr AP (gross).
/// </summary>
public sealed class SettleConsignmentCommandHandler(
    InventoryDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IMediator mediator) : ICommandHandler<SettleConsignmentCommand, Guid>
{
    public async ValueTask<Guid> Handle(SettleConsignmentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Nullable — ConsignmentSettlement is a ledger/reporting entity (docs/branch-scoping-plan.md).
        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        // Read before the transaction opens: another module's answer never runs under these locks.
        decimal vatRate = command.SupplierChargesVat
            ? (await mediator.Send(new GetPharmacySettingsQuery(), cancellationToken).ConfigureAwait(false)).VatRatePercent
            : 0m;

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

        var batchIds = positions.Select(p => p.BatchId).Distinct().ToList();
        var soldByBatch = await ConsignedStock.SoldFromLotsAsync(dbContext, batchIds, cancellationToken).ConfigureAwait(false);
        var taxableBatchIds = vatRate > 0
            ? await TaxableBatchIdsAsync(batchIds, cancellationToken).ConfigureAwait(false)
            : [];

        decimal totalAmount = 0m;
        decimal vatAmount = 0m;
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
            decimal amount = newlySold * position.UnitCostPrice;
            totalAmount += amount;
            if (taxableBatchIds.Contains(position.BatchId))
            {
                vatAmount += Math.Round(amount * vatRate / 100m, 2, MidpointRounding.AwayFromZero);
            }

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
            ActorName.Of(currentUser), branchId, vatAmount);

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
            BranchId: branchId,
            VatAmount: vatAmount),
            cancellationToken).ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return settlement.Id;
    }

    /// <summary>The lots among <paramref name="batchIds"/> bought as VAT-able — the lot's own flag, not the
    /// medicine's today, so a corrected flag doesn't change the VAT on stock received before it.</summary>
    private async Task<HashSet<Guid>> TaxableBatchIdsAsync(List<Guid> batchIds, CancellationToken cancellationToken)
    {
        var ids = await dbContext.MedicineBatches.AsNoTracking()
            .Where(b => batchIds.Contains(b.Id) && b.IsTaxable)
            .Select(b => b.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        return [.. ids];
    }
}
