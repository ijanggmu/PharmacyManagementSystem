using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Services;

/// <summary>
/// The price level a cart is priced at. <see cref="Customer"/> is the customer's own level (null = retail: no level
/// assigned, a walk-in, or the level is inactive); <see cref="Applied"/> is the level the sale is actually priced at
/// — the customer's own unless the till asked for another.
/// </summary>
public sealed record PriceLevelResolution(PriceLevelPricing? Customer, PriceLevelPricing? Applied)
{
    public static PriceLevelResolution Retail { get; } = new(null, null);

    /// <summary>True when the till asked for a level other than the customer's own.</summary>
    public bool IsOverride => Applied?.Id != Customer?.Id;

    /// <summary>A base unit's price from a lot priced <paramref name="lotPrice"/> at the applied level.</summary>
    public decimal UnitPrice(Guid medicineId, decimal lotPrice) => PriceAt(Applied, medicineId, lotPrice);

    /// <summary>The same unit at the customer's own level — what an override is measured against.</summary>
    public decimal CustomerUnitPrice(Guid medicineId, decimal lotPrice) => PriceAt(Customer, medicineId, lotPrice);

    private static decimal PriceAt(PriceLevelPricing? level, Guid medicineId, decimal lotPrice) =>
        level?.PriceFor(medicineId, lotPrice) ?? lotPrice;
}

/// <summary>Reads price levels from the Sales schema for CreateSale and the till's price quote.</summary>
internal static class PriceLevelResolver
{
    /// <summary>
    /// Resolves the customer's own level and the applied one. <paramref name="requestedLevelId"/>: null = the
    /// customer's own; <see cref="Guid.Empty"/> = retail; anything else must be an active level (400 otherwise).
    /// Only the explicit prices of <paramref name="medicineIds"/> are loaded.
    /// </summary>
    public static async ValueTask<PriceLevelResolution> ResolveAsync(
        SalesDbContext dbContext,
        Guid? customerId,
        Guid? requestedLevelId,
        IEnumerable<Guid> medicineIds,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        var medicines = medicineIds.Distinct().ToList();

        Guid? customerLevelId = null;
        if (customerId is { } id)
        {
            customerLevelId = await dbContext.CustomerPriceLevels.AsNoTracking()
                .Where(c => c.CustomerId == id)
                .Select(c => (Guid?)c.PriceLevelId)
                .FirstOrDefaultAsync(cancellationToken)
                .ConfigureAwait(false);
        }

        // An inactive assigned level is ignored (the customer buys at retail until it is re-activated).
        var customerLevel = customerLevelId is { } levelId
            ? await LoadAsync(dbContext, levelId, medicines, requireActive: false, cancellationToken).ConfigureAwait(false)
            : null;

        PriceLevelPricing? applied = requestedLevelId switch
        {
            null => customerLevel,
            { } requested when requested == Guid.Empty => null,
            { } requested when requested == customerLevel?.Id => customerLevel,
            { } requested => await LoadAsync(dbContext, requested, medicines, requireActive: true, cancellationToken).ConfigureAwait(false),
        };

        return new PriceLevelResolution(customerLevel, applied);
    }

    private static async ValueTask<PriceLevelPricing?> LoadAsync(
        SalesDbContext dbContext, Guid levelId, IReadOnlyCollection<Guid> medicineIds, bool requireActive, CancellationToken cancellationToken)
    {
        var level = await dbContext.PriceLevels.AsNoTracking()
            .FirstOrDefaultAsync(l => l.Id == levelId, cancellationToken)
            .ConfigureAwait(false);

        if (level is null || !level.IsActive)
        {
            if (requireActive)
            {
                throw new CustomException(
                    "That price level doesn't exist or is no longer active. Choose another level.",
                    (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            return null;
        }

        var prices = medicineIds.Count == 0
            ? new Dictionary<Guid, decimal>()
            : await dbContext.PriceLevelItems.AsNoTracking()
                .Where(i => i.PriceLevelId == levelId && medicineIds.Contains(i.MedicineId))
                .ToDictionaryAsync(i => i.MedicineId, i => i.UnitPrice, cancellationToken)
                .ConfigureAwait(false);

        return new PriceLevelPricing(level.Id, level.Name, level.DiscountPercent, prices);
    }
}
