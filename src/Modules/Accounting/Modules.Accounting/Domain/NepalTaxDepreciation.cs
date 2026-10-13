namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// What the tax depreciation of one asset depends on. <see cref="FirstFiscalYear"/> is the income year the asset enters
/// its pool: the acquisition year for a new asset, the go-live year for an opening one, which enters with
/// <see cref="OpeningTaxBase"/> (its share of the pool's written-down value then) instead of as an addition.
/// <see cref="DisposalProceeds"/> (VAT-exclusive; 0 for a write-off) leave the pool in <see cref="DisposalFiscalYear"/>.
/// </summary>
public sealed record TaxAssetFacts(
    string Pool,
    decimal Cost,
    FiscalPeriod Acquired,
    bool IsOpening,
    int FirstFiscalYear,
    decimal OpeningTaxBase,
    int? DisposalFiscalYear,
    decimal DisposalProceeds,
    int? UsefulLifeYears);

/// <summary>One pool's tax depreciation for one income year (see <see cref="NepalTaxDepreciation"/>).</summary>
public sealed record TaxPoolYear(
    NepalTaxPool Pool,
    decimal OpeningBase,
    decimal AdditionsFull,
    decimal AdditionsTwoThirds,
    decimal AdditionsOneThird,
    decimal AdditionsIncluded,
    decimal DisposalProceeds,
    decimal DepreciationBase,
    decimal Depreciation,
    decimal Recapture,
    decimal TerminalDeduction,
    decimal DeferredAdditions,
    decimal ClosingBase,
    int AssetCount);

/// <summary>
/// Nepal tax depreciation (Income Tax Act 2058, Schedule 2), computed per pool and income year (Shrawan–Ashadh). Rates come
/// from <see cref="NepalTaxPoolDefaults"/>.
/// <para><b>Pools A–D</b> (diminishing balance on the pool):</para>
/// <list type="number">
/// <item>Opening base = last year's closing base (+ the opening tax WDV of assets taken over at go-live this year).</item>
/// <item>Additions enter the base by the quarter acquired: Shrawan–Poush (first two quarters) in full, Magh–Chaitra
/// (third quarter) 2/3, Baisakh–Ashadh (fourth quarter) 1/3. The remainder is carried into next year's opening base
/// (so every rupee of cost is depreciated, a later acquisition just starts later).</item>
/// <item>Disposal proceeds of pool assets sold in the year reduce the base.</item>
/// <item>Depreciation base = opening + additions included − proceeds. A negative base is included in income
/// (<c>Recapture</c>) and becomes 0.</item>
/// <item>Depreciation = base × rate; closing = base − depreciation + deferred additions.</item>
/// <item>If no asset is left in the pool at the year end, what remains (base + deferred) is deducted in full
/// (<c>TerminalDeduction</c>) and the pool closes at 0.</item>
/// </list>
/// <para><b>Pool E</b> (intangibles) is asset by asset: cost ÷ useful life (years) per year — the acquisition year at
/// the same 3/3, 2/3, 1/3 fraction — never more than the asset's remaining tax value. On disposal the remaining value
/// less the proceeds is deducted (or, when negative, included in income).</para>
/// </summary>
public static class NepalTaxDepreciation
{
    /// <summary>The pool rows (all five pools, in order) for income year <paramref name="fiscalYear"/>, carrying every
    /// earlier year forward from the first year any asset entered a pool.</summary>
    public static IReadOnlyList<TaxPoolYear> ForYear(IReadOnlyCollection<TaxAssetFacts> assets, int fiscalYear)
    {
        ArgumentNullException.ThrowIfNull(assets);

        int firstYear = assets.Count == 0 ? fiscalYear : Math.Min(fiscalYear, assets.Min(a => a.FirstFiscalYear));
        var closing = NepalTaxPoolDefaults.All.ToDictionary(p => p.Code, _ => 0m, StringComparer.Ordinal);
        var remainingE = new Dictionary<TaxAssetFacts, decimal>(ReferenceEqualityComparer.Instance);
        List<TaxPoolYear> rows = [];

        for (int year = firstYear; year <= fiscalYear; year++)
        {
            rows = [];
            foreach (var pool in NepalTaxPoolDefaults.All)
            {
                var poolAssets = assets.Where(a => string.Equals(a.Pool, pool.Code, StringComparison.OrdinalIgnoreCase)).ToList();
                var row = pool.PerAssetUsefulLife
                    ? IntangibleYear(pool, poolAssets, year, remainingE)
                    : PoolYear(pool, poolAssets, year, closing[pool.Code]);
                closing[pool.Code] = row.ClosingBase;
                rows.Add(row);
            }
        }

        return rows;
    }

    /// <summary>The part of <paramref name="cost"/> that enters the base in the acquisition year, by fiscal month
    /// (<see cref="FiscalPeriod.TaxAdditionThirds"/>).</summary>
    public static decimal IncludedInYear(decimal cost, FiscalPeriod acquired) =>
        acquired.TaxAdditionThirds switch
        {
            3 => cost,
            2 => Round(cost * 2m / 3m),
            _ => Round(cost / 3m),
        };

    private static TaxPoolYear PoolYear(NepalTaxPool pool, List<TaxAssetFacts> assets, int year, decimal carried)
    {
        decimal opening = carried + assets.Where(a => a.IsOpening && a.FirstFiscalYear == year).Sum(a => a.OpeningTaxBase);

        var additions = assets.Where(a => !a.IsOpening && a.FirstFiscalYear == year).ToList();
        decimal full = additions.Where(a => a.Acquired.TaxAdditionThirds == 3).Sum(a => a.Cost);
        decimal twoThirds = additions.Where(a => a.Acquired.TaxAdditionThirds == 2).Sum(a => a.Cost);
        decimal oneThird = additions.Where(a => a.Acquired.TaxAdditionThirds == 1).Sum(a => a.Cost);
        decimal included = additions.Sum(a => IncludedInYear(a.Cost, a.Acquired));
        decimal deferred = full + twoThirds + oneThird - included;

        decimal proceeds = assets.Where(a => a.DisposalFiscalYear == year).Sum(a => a.DisposalProceeds);
        decimal depreciationBase = opening + included - proceeds;
        decimal recapture = 0m;
        if (depreciationBase < 0m)
        {
            recapture = -depreciationBase;
            depreciationBase = 0m;
        }

        int remaining = assets.Count(a => a.FirstFiscalYear <= year && (a.DisposalFiscalYear is null || a.DisposalFiscalYear > year));
        decimal depreciation = 0m;
        decimal terminal = 0m;
        decimal closingBase;
        if (remaining == 0 && depreciationBase + deferred > 0m)
        {
            terminal = depreciationBase + deferred;
            deferred = 0m;
            closingBase = 0m;
        }
        else
        {
            depreciation = Round(depreciationBase * pool.RatePercent / 100m);
            closingBase = depreciationBase - depreciation + deferred;
        }

        return new TaxPoolYear(
            pool, opening, full, twoThirds, oneThird, included, proceeds, depreciationBase, depreciation,
            recapture, terminal, deferred, closingBase, remaining);
    }

    private static TaxPoolYear IntangibleYear(
        NepalTaxPool pool, List<TaxAssetFacts> assets, int year, Dictionary<TaxAssetFacts, decimal> remainingValue)
    {
        decimal opening = 0m, additions = 0m, proceeds = 0m, depreciation = 0m, recapture = 0m, terminal = 0m;
        int count = 0;

        foreach (var asset in assets.Where(a => a.FirstFiscalYear <= year && (a.DisposalFiscalYear is null || a.DisposalFiscalYear >= year)))
        {
            bool enteringNow = asset.FirstFiscalYear == year;
            if (enteringNow)
            {
                remainingValue[asset] = asset.IsOpening ? asset.OpeningTaxBase : asset.Cost;
                if (asset.IsOpening)
                {
                    opening += remainingValue[asset];
                }
                else
                {
                    additions += asset.Cost;
                }
            }
            else
            {
                opening += remainingValue[asset];
            }

            decimal value = remainingValue[asset];
            if (asset.DisposalFiscalYear == year)
            {
                proceeds += asset.DisposalProceeds;
                decimal difference = value - asset.DisposalProceeds;
                if (difference >= 0m)
                {
                    terminal += difference;
                }
                else
                {
                    recapture += -difference;
                }

                remainingValue[asset] = 0m;
                continue;
            }

            count++;
            int life = Math.Max(1, asset.UsefulLifeYears ?? 1);
            decimal annual = asset.Cost / life;
            if (enteringNow && !asset.IsOpening)
            {
                annual = annual * asset.Acquired.TaxAdditionThirds / 3m;
            }

            decimal charge = Math.Min(Round(annual), value);
            depreciation += charge;
            remainingValue[asset] = value - charge;
        }

        decimal closingBase = assets
            .Where(a => remainingValue.ContainsKey(a))
            .Sum(a => remainingValue[a]);
        decimal depreciationBase = Math.Max(0m, opening + additions - proceeds);

        return new TaxPoolYear(
            pool, opening, additions, 0m, 0m, additions, proceeds, depreciationBase, depreciation,
            recapture, terminal, 0m, closingBase, count);
    }

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
