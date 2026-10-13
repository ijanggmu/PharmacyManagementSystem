using System.Globalization;

namespace FSH.Modules.Accounting.Jobs.OperationalAlerts;

/// <summary>
/// Per-tenant knobs for the operational alerts scan, read from the Reference tenant settings (category
/// <c>alerts</c>, set via <c>PUT /api/v1/reference/settings/{key}</c>). A missing, empty or unparsable value
/// falls back to its default, and numbers are clamped to a sane range, so a typo can never stop the scan.
/// <list type="table">
///   <item><term>alerts.enabled</term><description>"false" turns the scan off for the tenant (default true).</description></item>
///   <item><term>alerts.expiry_days</term><description>Batches expiring within this many days (default 60, 1–365).</description></item>
///   <item><term>alerts.overdue_days</term><description>A supplier bill / customer due older than this is overdue
///   (default 30). Bills carry no due date, so age is the rule; the AR/AP aging reports bucket by 30 days, so
///   the value is rounded down to 30, 60 or 90.</description></item>
///   <item><term>alerts.repeat_days</term><description>An unchanged digest is repeated at most every N days (default 7, 1–30).</description></item>
/// </list>
/// </summary>
public sealed record OperationalAlertSettings(bool Enabled, int ExpiryDays, int OverdueDays, int RepeatAfterDays)
{
    public const string Category = "alerts";
    public const string EnabledKey = "alerts.enabled";
    public const string ExpiryDaysKey = "alerts.expiry_days";
    public const string OverdueDaysKey = "alerts.overdue_days";
    public const string RepeatDaysKey = "alerts.repeat_days";

    public const int DefaultExpiryDays = 60;
    public const int DefaultOverdueDays = 30;
    public const int DefaultRepeatAfterDays = 7;

    public static OperationalAlertSettings Default { get; } =
        new(true, DefaultExpiryDays, DefaultOverdueDays, DefaultRepeatAfterDays);

    public static OperationalAlertSettings From(IReadOnlyDictionary<string, string>? values)
    {
        if (values is null)
        {
            return Default;
        }

        bool enabled = !values.TryGetValue(EnabledKey, out var raw)
            || !bool.TryParse(raw?.Trim(), out bool parsed)
            || parsed;

        return new OperationalAlertSettings(
            enabled,
            ReadInt(values, ExpiryDaysKey, DefaultExpiryDays, 1, 365),
            SnapOverdueDays(ReadInt(values, OverdueDaysKey, DefaultOverdueDays, 30, 365)),
            ReadInt(values, RepeatDaysKey, DefaultRepeatAfterDays, 1, 30));
    }

    /// <summary>Rounds an overdue age down to the aging report's bucket edges: 30, 60 or 90 days.</summary>
    public static int SnapOverdueDays(int days) => days switch
    {
        >= 90 => 90,
        >= 60 => 60,
        _ => 30,
    };

    private static int ReadInt(IReadOnlyDictionary<string, string> values, string key, int fallback, int min, int max)
    {
        if (!values.TryGetValue(key, out var raw)
            || !int.TryParse(raw?.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out int value))
        {
            return fallback;
        }

        return Math.Clamp(value, min, max);
    }
}
