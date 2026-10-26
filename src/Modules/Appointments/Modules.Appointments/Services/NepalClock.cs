namespace FSH.Modules.Appointments.Services;

/// <summary>
/// The pharmacy's calendar day. Nepal runs on UTC+05:45 with no daylight saving, so between 18:15 and 24:00 UTC
/// the server's UTC date is still "yesterday" for the pharmacy. Same offset as Prescriptions' <c>NepalClock</c>,
/// which Appointments can't reference.
/// </summary>
internal static class NepalClock
{
    public static readonly TimeSpan Offset = new(5, 45, 0);

    /// <summary>The Nepal calendar date at the UTC instant <paramref name="utcNow"/>.</summary>
    public static DateOnly DateOf(DateTime utcNow) =>
        DateOnly.FromDateTime(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc) + Offset);

    /// <summary>Today in Nepal, from <paramref name="timeProvider"/> (tests inject a fixed clock).</summary>
    public static DateOnly Today(TimeProvider timeProvider)
    {
        ArgumentNullException.ThrowIfNull(timeProvider);
        return DateOf(timeProvider.GetUtcNow().UtcDateTime);
    }
}
