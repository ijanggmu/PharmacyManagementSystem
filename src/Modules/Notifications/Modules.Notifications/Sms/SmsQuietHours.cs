namespace FSH.Modules.Notifications.Sms;

/// <summary>
/// Quiet hours in Nepal time (UTC+05:45, no daylight saving). <c>start</c> and <c>end</c> are whole hours (0-23); the
/// window is [start:00, end:00) and may run over midnight (the default 21 → 7). <c>start == end</c> means no quiet hours.
/// </summary>
public static class SmsQuietHours
{
    public static readonly TimeSpan NepalOffset = new(5, 45, 0);

    public const int DefaultStart = 21;
    public const int DefaultEnd = 7;

    public static DateTime ToNepal(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Unspecified) + NepalOffset;

    public static bool IsQuiet(DateTime utc, int startHour, int endHour)
    {
        if (startHour == endHour)
        {
            return false;
        }

        int hour = ToNepal(utc).Hour;
        return startHour > endHour
            ? hour >= startHour || hour < endHour
            : hour >= startHour && hour < endHour;
    }

    /// <summary><paramref name="utc"/> itself outside quiet hours, else the UTC instant they end.</summary>
    public static DateTime NextAllowedUtc(DateTime utc, int startHour, int endHour)
    {
        if (!IsQuiet(utc, startHour, endHour))
        {
            return utc;
        }

        DateTime local = ToNepal(utc);
        DateTime end = local.Date.AddHours(endHour);
        if (end <= local)
        {
            end = end.AddDays(1);
        }

        return DateTime.SpecifyKind(end - NepalOffset, DateTimeKind.Utc);
    }
}
