using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets;

/// <summary>An asset's unposted depreciation months in a period, from its schedule.</summary>
public sealed record PlannedDepreciation(FixedAsset Asset, IReadOnlyList<PeriodAmount> Months, decimal AccumulatedBefore)
{
    public decimal Amount => Months.Sum(m => m.Amount);
}

/// <summary>
/// Decides what a depreciation run posts: for each asset, the months of [<c>fromPeriod</c>, <c>toPeriod</c>] its schedule
/// charges (<see cref="BookDepreciation"/>) that are not posted yet. A month already posted is skipped — that is what
/// makes a repeated run a no-op.
/// </summary>
public static class DepreciationPlanner
{
    public static IReadOnlyList<PlannedDepreciation> Plan(
        IEnumerable<FixedAsset> assets, IReadOnlyDictionary<Guid, PostedDepreciation> posted, int fromPeriod, int toPeriod)
    {
        ArgumentNullException.ThrowIfNull(assets);
        ArgumentNullException.ThrowIfNull(posted);

        var plan = new List<PlannedDepreciation>();
        foreach (var asset in assets)
        {
            var done = posted.TryGetValue(asset.Id, out var p) ? p : PostedDepreciation.None;
            var months = BookDepreciation.Schedule(asset.Terms, toPeriod)
                .Where(m => m.Period >= fromPeriod && !done.Periods.Contains(m.Period))
                .ToList();
            if (months.Count > 0)
            {
                plan.Add(new PlannedDepreciation(asset, months, asset.OpeningAccumulatedDepreciation + done.Total));
            }
        }

        return plan;
    }

    /// <summary>Months before <paramref name="beforePeriod"/> the asset's schedule charges that are not posted yet — a
    /// disposal must wait until they are.</summary>
    public static IReadOnlyList<PeriodAmount> UnpostedBefore(FixedAsset asset, PostedDepreciation posted, int beforePeriod)
    {
        ArgumentNullException.ThrowIfNull(asset);
        ArgumentNullException.ThrowIfNull(posted);
        return BookDepreciation.Schedule(asset.Terms, beforePeriod - 1)
            .Where(m => !posted.Periods.Contains(m.Period))
            .ToList();
    }
}

/// <summary>The months already posted for one asset and their total.</summary>
public sealed record PostedDepreciation(IReadOnlySet<int> Periods, decimal Total)
{
    public static PostedDepreciation None { get; } = new(new HashSet<int>(), 0m);

    public int? LastPeriod => Periods.Count == 0 ? null : Periods.Max();
}
