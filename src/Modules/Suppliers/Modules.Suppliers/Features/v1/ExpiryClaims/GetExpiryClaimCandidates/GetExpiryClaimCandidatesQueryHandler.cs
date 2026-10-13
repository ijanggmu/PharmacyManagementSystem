using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims.GetExpiryClaimCandidates;

/// <summary>
/// Near-expiry and expired lots of the caller's branch (Inventory's expiring-batches report, which includes
/// the already expired), grouped by the supplier that delivered them. Consigned lots are dropped (the
/// supplier's own stock is settled, not claimed — the supplier return refuses them too), and the units open
/// claims already hold are subtracted. The branch is the caller's own because an accepted claim's return is
/// deducted from the caller's branch stock.
/// </summary>
public sealed class GetExpiryClaimCandidatesQueryHandler(
    SuppliersDbContext dbContext,
    IMediator mediator,
    ICurrentBranch currentBranch)
    : IQueryHandler<GetExpiryClaimCandidatesQuery, IReadOnlyList<ExpiryClaimCandidateGroupDto>>
{
    public async ValueTask<IReadOnlyList<ExpiryClaimCandidateGroupDto>> Handle(
        GetExpiryClaimCandidatesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        var expiring = await mediator.Send(new GetExpiringBatchesQuery(query.WithinDays, branchId), cancellationToken)
            .ConfigureAwait(false);
        if (expiring.Count == 0)
        {
            return [];
        }

        var sources = (await mediator.Send(new GetBatchSourcesQuery(expiring.Select(e => e.BatchId).ToList()), cancellationToken)
                .ConfigureAwait(false))
            .Where(s => !s.IsConsigned && !s.IsDisposed && s.BranchId == branchId)
            .ToList();
        var attribution = await ExpiryClaimLots.AttributeAsync(mediator, sources, cancellationToken).ConfigureAwait(false);
        var claimed = await ExpiryClaimLots.OpenClaimedAsync(dbContext, sources.Select(s => s.BatchId).ToList(), null, cancellationToken)
            .ConfigureAwait(false);

        var supplierIds = attribution.Values.Where(a => a.SupplierId is not null).Select(a => a.SupplierId!.Value).Distinct().ToList();
        var names = await dbContext.Suppliers.AsNoTracking()
            .Where(s => supplierIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => s.Name, cancellationToken)
            .ConfigureAwait(false);

        var daysByLot = expiring.ToDictionary(e => e.BatchId, e => e.DaysUntilExpiry);
        var lots = new List<(Guid? SupplierId, ExpiryClaimCandidateLotDto Lot)>();
        foreach (var source in sources)
        {
            decimal already = claimed.GetValueOrDefault(source.BatchId);
            decimal claimable = Math.Max(0m, source.QuantityOnHand - already);
            if (claimable <= 0)
            {
                continue;
            }

            var who = attribution[source.BatchId];
            // A supplier that no longer exists (deleted) can't be claimed against: treat the lot as unattributed.
            Guid? supplierId = who.SupplierId is { } id && names.ContainsKey(id) ? id : null;
            if (query.SupplierId is { } wanted && supplierId != wanted)
            {
                continue;
            }

            int days = daysByLot[source.BatchId];
            lots.Add((supplierId, new ExpiryClaimCandidateLotDto(
                source.BatchId, source.MedicineId, source.MedicineName, source.BatchNo, source.ExpiryDate, days, days < 0,
                source.QuantityOnHand, already, claimable, source.CostPrice,
                Math.Round(claimable * source.CostPrice, 2, MidpointRounding.AwayFromZero),
                supplierId is null ? LotAttribution.Unknown : who.Source)));
        }

        return lots
            .GroupBy(l => l.SupplierId)
            .Select(g => new ExpiryClaimCandidateGroupDto(
                g.Key,
                g.Key is { } id ? names[id] : null,
                g.Select(l => l.Lot).OrderBy(l => l.ExpiryDate).ThenBy(l => l.MedicineName).ToList(),
                g.Sum(l => l.Lot.ClaimableValue)))
            .OrderBy(g => g.SupplierId is null)
            .ThenByDescending(g => g.TotalValue)
            .ToList();
    }
}
