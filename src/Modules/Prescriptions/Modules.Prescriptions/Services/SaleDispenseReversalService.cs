using FSH.Framework.Persistence;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Prescriptions.Services;

/// <summary>A medicine and quantity being given back (a returned line).</summary>
public sealed record DispenseReversalLine(Guid MedicineId, decimal Quantity);

/// <summary>
/// Gives prescription quantity back when the sale that consumed it is cancelled or (partly) returned, so a
/// patient whose sale was undone can still collect what the doctor prescribed.
/// <para>Driven by the sale-stamped <see cref="PrescriptionRefill"/> rows the sale wrote: only what that sale
/// actually dispensed can be reversed, and never more than what is left after earlier reversals. Each
/// reversal is recorded as a <see cref="PrescriptionDispenseReversal"/> (the audit trail); its unique
/// (source document, item) index plus the pre-check make a redelivered event a no-op. The fill slot is
/// given back only once the sale's whole dispense of that item has been reversed.</para>
/// </summary>
public sealed partial class SaleDispenseReversalService(
    PrescriptionsDbContext dbContext,
    AmbientDbTransactionRegistry ambientTransactions,
    TimeProvider timeProvider,
    ILogger<SaleDispenseReversalService> logger)
{
    /// <summary>
    /// Reverses sale <paramref name="saleId"/>'s dispense. <paramref name="lines"/> null = everything the sale
    /// dispensed (cancellation); otherwise the returned quantity per medicine, capped at what is reversible.
    /// Returns the number of prescription items adjusted.
    /// </summary>
    public async ValueTask<int> ReverseAsync(
        Guid saleId,
        DispenseReversalSource source,
        Guid sourceId,
        IReadOnlyList<DispenseReversalLine>? lines,
        CancellationToken cancellationToken = default)
    {
        int adjusted = 0;
        await PrescriptionWrites.RunInTransactionAsync(dbContext, ambientTransactions, async ct =>
        {
            dbContext.ChangeTracker.Clear();
            adjusted = await ReverseWithinTransactionAsync(saleId, source, sourceId, lines, ct).ConfigureAwait(false);
        }, cancellationToken).ConfigureAwait(false);
        return adjusted;
    }

    private async ValueTask<int> ReverseWithinTransactionAsync(
        Guid saleId,
        DispenseReversalSource source,
        Guid sourceId,
        IReadOnlyList<DispenseReversalLine>? lines,
        CancellationToken ct)
    {
        var dispenses = await dbContext.PrescriptionRefills.AsNoTracking()
            .Where(r => r.SaleId == saleId)
            .OrderBy(r => r.RefilledAtUtc)
            .ToListAsync(ct)
            .ConfigureAwait(false);
        if (dispenses.Count == 0)
        {
            // The sale dispensed nothing against a prescription (or predates sale-stamped refills).
            return 0;
        }

        if (await dbContext.PrescriptionDispenseReversals.AnyAsync(r => r.SourceId == sourceId, ct).ConfigureAwait(false))
        {
            return 0; // already applied (redelivered event)
        }

        var prescriptionIds = dispenses.Select(d => d.PrescriptionId).Distinct().ToList();
        await PrescriptionWrites.LockItemsAsync(dbContext, prescriptionIds, ct).ConfigureAwait(false);

        var itemIds = dispenses.Select(d => d.PrescriptionItemId).Distinct().ToList();
        var items = await dbContext.PrescriptionItems
            .Where(i => itemIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, ct)
            .ConfigureAwait(false);

        var alreadyReversed = await dbContext.PrescriptionDispenseReversals.AsNoTracking()
            .Where(r => r.SaleId == saleId)
            .GroupBy(r => r.PrescriptionItemId)
            .Select(g => new { ItemId = g.Key, Quantity = g.Sum(r => r.Quantity) })
            .ToDictionaryAsync(x => x.ItemId, x => x.Quantity, ct)
            .ConfigureAwait(false);

        // What is left to give back per medicine (null = everything, a cancellation).
        Dictionary<Guid, decimal>? wanted = lines?
            .GroupBy(l => l.MedicineId)
            .ToDictionary(g => g.Key, g => g.Sum(l => l.Quantity));

        var now = timeProvider.GetUtcNow().UtcDateTime;
        int adjusted = 0;
        foreach (var dispense in dispenses)
        {
            if (!items.TryGetValue(dispense.PrescriptionItemId, out var item))
            {
                continue;
            }

            decimal reversedBefore = alreadyReversed.GetValueOrDefault(item.Id);
            decimal reversible = Math.Min(dispense.QuantityDispensed - reversedBefore, item.DispensedQuantity);
            decimal quantity = reversible;
            if (wanted is not null)
            {
                quantity = Math.Min(reversible, wanted.GetValueOrDefault(dispense.MedicineId));
                if (quantity > 0)
                {
                    wanted[dispense.MedicineId] -= quantity;
                }
            }

            if (quantity <= 0)
            {
                continue;
            }

            bool restoreFill = reversedBefore + quantity >= dispense.QuantityDispensed;
            item.ReverseDispense(quantity, restoreFill);
            dbContext.PrescriptionDispenseReversals.Add(
                PrescriptionDispenseReversal.Create(item, saleId, source, sourceId, quantity, restoreFill, now));
            alreadyReversed[item.Id] = reversedBefore + quantity;
            adjusted++;
        }

        if (adjusted > 0)
        {
            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
            LogReversed(logger, saleId, source, sourceId, adjusted);
        }

        return adjusted;
    }

    [LoggerMessage(Level = LogLevel.Information,
        Message = "Gave back prescription quantity for sale {SaleId} ({Source} {SourceId}) on {ItemCount} item(s)")]
    private static partial void LogReversed(ILogger logger, Guid saleId, DispenseReversalSource source, Guid sourceId, int itemCount);
}
