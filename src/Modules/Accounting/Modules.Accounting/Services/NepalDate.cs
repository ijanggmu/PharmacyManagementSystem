namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Nepal civil-day helpers for Accounting (Nepal Standard Time is UTC+05:45, no DST). Vouchers store
/// instants in UTC, but every business rule that talks about a "day" — the posting-lock date, a report's
/// from/to dates — means the day as the pharmacy sees it in Kathmandu. Converting a UTC instant with
/// <c>DateOnly.FromDateTime(utc)</c> is wrong for the first 5h45m of every Nepal day (00:00–05:44 NPT is
/// still "yesterday" in UTC). Mirrors <c>Sales.Services.NepalDayRange</c>; kept local so Accounting does
/// not depend on another module's runtime project.
/// </summary>
public static class NepalDate
{
    public static readonly TimeSpan Offset = new(5, 45, 0);

    /// <summary>The Nepal calendar date that contains the UTC instant <paramref name="utc"/>.</summary>
    public static DateOnly FromUtc(DateTime utc) =>
        DateOnly.FromDateTime(DateTime.SpecifyKind(utc, DateTimeKind.Utc) + Offset);

    /// <summary>The UTC instant at which <paramref name="day"/> starts in Nepal.</summary>
    public static DateTime StartUtc(DateOnly day) =>
        DateTime.SpecifyKind(day.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc) - Offset;

    /// <summary>The UTC instant at which the day after <paramref name="day"/> starts in Nepal — an
    /// exclusive upper bound that makes <paramref name="day"/> itself fully inclusive.</summary>
    public static DateTime EndExclusiveUtc(DateOnly day) => StartUtc(day.AddDays(1));
}
