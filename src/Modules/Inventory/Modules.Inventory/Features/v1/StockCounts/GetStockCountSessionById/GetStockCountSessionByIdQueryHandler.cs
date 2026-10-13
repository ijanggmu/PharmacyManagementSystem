using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.StockCounts.GetStockCountSessionById;

/// <summary>The count sheet with each lot's variance (live while open, frozen once posted).</summary>
public sealed class GetStockCountSessionByIdQueryHandler(
    InventoryDbContext dbContext,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider)
    : IQueryHandler<GetStockCountSessionByIdQuery, StockCountSessionDetailDto>
{
    public async ValueTask<StockCountSessionDetailDto> Handle(GetStockCountSessionByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var session = await StockCountStore.FindSessionAsync(dbContext, currentBranch, query.SessionId, cancellationToken)
            .ConfigureAwait(false);

        var lines = await dbContext.StockCountLines.AsNoTracking()
            .Where(l => l.SessionId == session.Id)
            .OrderBy(l => l.RackLocation).ThenBy(l => l.MedicineName).ThenBy(l => l.ExpiryDate)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var batchIds = lines.Where(l => l.BatchId is not null).Select(l => l.BatchId!.Value).Distinct().ToList();
        var live = await dbContext.MedicineBatches.AsNoTracking()
            .Where(b => batchIds.Contains(b.Id))
            .Select(b => new { b.Id, b.QuantityOnHand })
            .ToDictionaryAsync(b => b.Id, b => b.QuantityOnHand, cancellationToken)
            .ConfigureAwait(false);

        bool posted = session.Status == StockCountStatus.Posted;
        var movements = posted || lines.Count == 0
            ? []
            : await StockCountStore.LoadMovementsAsync(
                dbContext, batchIds, lines.Min(l => l.SnapshotAtUtc), excludeReferenceId: null, cancellationToken)
                .ConfigureAwait(false);

        DateTime now = timeProvider.GetUtcNow().UtcDateTime;
        var dtos = lines
            .Select(l => StockCountMapper.ToDto(
                l, posted,
                l.BatchId is { } id && movements.TryGetValue(id, out var m) ? m : [],
                l.BatchId is { } bid && live.TryGetValue(bid, out var q) ? q : null,
                now))
            .ToList();

        decimal gain = posted ? session.PostedGainValue : dtos.Where(d => d.VarianceValue > 0).Sum(d => d.VarianceValue!.Value);
        decimal loss = posted ? session.PostedLossValue : -dtos.Where(d => d.VarianceValue < 0).Sum(d => d.VarianceValue!.Value);

        return new StockCountSessionDetailDto(
            StockCountMapper.ToDto(session, lines.Count, lines.Count(l => l.CountedQuantity is not null)),
            dtos, gain, loss, gain - loss);
    }
}
