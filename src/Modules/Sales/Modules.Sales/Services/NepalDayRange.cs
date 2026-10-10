namespace FSH.Modules.Sales.Services;

/// <summary>
/// Converts whole Nepal-time (UTC+05:45, no DST) calendar days into UTC bounds, so a list filter for
/// "1–3 Kartik" covers 00:00 NPT on the first day up to (but excluding) 00:00 NPT after the last day,
/// whatever timezone the caller's browser runs in.
/// </summary>
public static class NepalDayRange
{
    private static readonly TimeSpan NepalOffset = new(5, 45, 0);

    /// <summary>The UTC instant at which <paramref name="day"/> starts in Nepal.</summary>
    public static DateTime StartUtc(DateOnly day) =>
        DateTime.SpecifyKind(day.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc) - NepalOffset;

    /// <summary>The UTC instant at which the day after <paramref name="day"/> starts in Nepal — an
    /// exclusive upper bound that makes <paramref name="day"/> itself fully inclusive.</summary>
    public static DateTime EndExclusiveUtc(DateOnly day) => StartUtc(day.AddDays(1));
}
