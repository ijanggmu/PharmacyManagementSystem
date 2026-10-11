namespace FSH.Modules.Inventory.Services;

/// <summary>
/// The pharmacy's calendar day. Nepal runs on UTC+05:45 with no daylight saving, so between 18:15 and
/// 24:00 UTC the server's UTC date is still "yesterday" for the pharmacy. Expiry checks, price
/// schedules and "today" report filters all have to use the Nepal date, or a lot that expired at
/// local midnight stays sellable for almost six hours (and a schedule for today is rejected as past).
/// Same offset as <c>NepalFiscalYear</c>/<c>NepalDayRange</c> in Sales, which Inventory can't reference.
/// </summary>
public static class NepalClock
{
    public static readonly TimeSpan Offset = new(5, 45, 0);

    /// <summary>The Nepal calendar date at the UTC instant <paramref name="utcNow"/>.</summary>
    public static DateOnly DateOf(DateTime utcNow) =>
        DateOnly.FromDateTime(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc) + Offset);

    /// <summary>The Nepal calendar date at <paramref name="instant"/>.</summary>
    public static DateOnly DateOf(DateTimeOffset instant) => DateOf(instant.UtcDateTime);

    /// <summary>Today in Nepal, from the system clock.</summary>
    public static DateOnly Today() => DateOf(DateTime.UtcNow);

    /// <summary>Today in Nepal, from <paramref name="timeProvider"/> (tests inject a fixed clock).</summary>
    public static DateOnly Today(TimeProvider timeProvider)
    {
        ArgumentNullException.ThrowIfNull(timeProvider);
        return DateOf(timeProvider.GetUtcNow());
    }
}
