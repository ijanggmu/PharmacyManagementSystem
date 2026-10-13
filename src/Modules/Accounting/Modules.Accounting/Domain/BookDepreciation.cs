namespace FSH.Modules.Accounting.Domain;

public enum FixedAssetDepreciationMethod
{
    StraightLine = 0,
    WrittenDownValue = 1,
}

/// <summary>
/// What book depreciation of one asset depends on. Periods are <see cref="FiscalPeriod.Index"/> values.
/// <see cref="StartPeriod"/> is the first month charged — the acquisition month for a new asset, the go-live month for
/// an opening one (whose earlier months are in <see cref="OpeningAccumulated"/>). <see cref="EndPeriodExclusive"/> is the
/// disposal month: nothing is charged for it or later.
/// </summary>
public sealed record BookDepreciationTerms(
    decimal Cost,
    decimal ResidualValue,
    FixedAssetDepreciationMethod Method,
    int? UsefulLifeMonths,
    decimal? RatePercent,
    int AcquisitionPeriod,
    int StartPeriod,
    decimal OpeningAccumulated = 0m,
    int? EndPeriodExclusive = null);

/// <summary>One month's book depreciation.</summary>
public readonly record struct PeriodAmount(int Period, decimal Amount);

/// <summary>
/// Monthly book depreciation, deterministic from the asset's terms (so a run, its preview and the schedule report always
/// agree, and a re-run recomputes exactly what was posted). Amounts are to the paisa; nothing is charged below the residual
/// value. The acquisition month is charged in full (month-of-acquisition convention); the disposal month is not.
/// <list type="bullet">
/// <item><b>Straight line</b>: depreciable = cost − residual − opening accumulated, spread over the remaining life
/// (useful life − months between acquisition and start). Month <c>i</c> (0-based) gets
/// <c>round(D·(i+1)/n) − round(D·i/n)</c>, so the months add up to D exactly.</item>
/// <item><b>Written-down value</b>: at the start (and each Shrawan) the base is the net book value then
/// (cost − accumulated); each month of that fiscal year gets <c>round(base × rate ÷ 100 ÷ 12)</c>, capped so the net book
/// value never falls below the residual value.</item>
/// </list>
/// </summary>
public static class BookDepreciation
{
    /// <summary>The depreciation of every month from the start through <paramref name="throughPeriod"/> (inclusive) that
    /// has a non-zero charge.</summary>
    public static IReadOnlyList<PeriodAmount> Schedule(BookDepreciationTerms terms, int throughPeriod)
    {
        ArgumentNullException.ThrowIfNull(terms);

        int last = throughPeriod;
        if (terms.EndPeriodExclusive is { } end)
        {
            last = Math.Min(last, end - 1);
        }

        if (last < terms.StartPeriod)
        {
            return [];
        }

        return terms.Method == FixedAssetDepreciationMethod.StraightLine
            ? StraightLine(terms, last)
            : WrittenDownValue(terms, last);
    }

    /// <summary>The charge for one month (0 when none).</summary>
    public static decimal AmountFor(BookDepreciationTerms terms, int period)
    {
        ArgumentNullException.ThrowIfNull(terms);
        foreach (var entry in Schedule(terms, period))
        {
            if (entry.Period == period)
            {
                return entry.Amount;
            }
        }

        return 0m;
    }

    /// <summary>Cost − residual − opening accumulated, never negative: what may still be depreciated from the start.</summary>
    public static decimal Depreciable(BookDepreciationTerms terms)
    {
        ArgumentNullException.ThrowIfNull(terms);
        return Math.Max(0m, terms.Cost - terms.ResidualValue - terms.OpeningAccumulated);
    }

    private static List<PeriodAmount> StraightLine(BookDepreciationTerms terms, int last)
    {
        var result = new List<PeriodAmount>();
        int life = terms.UsefulLifeMonths ?? 0;
        int remaining = life - Math.Max(0, terms.StartPeriod - terms.AcquisitionPeriod);
        decimal depreciable = Depreciable(terms);
        if (remaining <= 0 || depreciable <= 0m)
        {
            return result;
        }

        int months = Math.Min(remaining, last - terms.StartPeriod + 1);
        for (int i = 0; i < months; i++)
        {
            decimal amount = Cumulative(depreciable, i + 1, remaining) - Cumulative(depreciable, i, remaining);
            if (amount > 0m)
            {
                result.Add(new PeriodAmount(terms.StartPeriod + i, amount));
            }
        }

        return result;
    }

    private static decimal Cumulative(decimal depreciable, int months, int remaining) =>
        Math.Round(depreciable * months / remaining, 2, MidpointRounding.AwayFromZero);

    private static List<PeriodAmount> WrittenDownValue(BookDepreciationTerms terms, int last)
    {
        var result = new List<PeriodAmount>();
        decimal rate = terms.RatePercent ?? 0m;
        if (rate <= 0m)
        {
            return result;
        }

        decimal accumulated = terms.OpeningAccumulated;
        decimal ceiling = Math.Max(0m, terms.Cost - terms.ResidualValue);
        decimal monthly = 0m;
        for (int period = terms.StartPeriod; period <= last; period++)
        {
            if (period == terms.StartPeriod || FiscalPeriod.FromIndex(period).Month == 1)
            {
                decimal openingNbv = terms.Cost - accumulated;
                monthly = Math.Round(openingNbv * rate / 100m / 12m, 2, MidpointRounding.AwayFromZero);
            }

            decimal amount = Math.Min(monthly, ceiling - accumulated);
            if (amount <= 0m)
            {
                break;
            }

            accumulated += amount;
            result.Add(new PeriodAmount(period, amount));
        }

        return result;
    }
}
