using FSH.Modules.Notifications.Domain;

namespace FSH.Modules.Notifications.Sms;

/// <summary>An earlier SMS as the dedupe rules see it.</summary>
public sealed record RecentSms(string? ReferenceKeys, SmsStatus Status, DateTime CreatedAtUtc);

/// <summary>
/// Reminder dedupe. Each SMS records what it was about as reference keys (<c>ar:{ledger entry}</c> for an invoice,
/// <c>rx:{prescription}</c>, <c>sale:{sale}</c>). An automatic reminder leaves out every item already covered by a
/// reminder created within the window that did not fail — so an invoice gets at most one automatic reminder per N days,
/// and a failed send does not block the next one.
/// </summary>
public static class SmsDedupe
{
    public const int MaxKeys = 40;

    public static string InvoiceKey(Guid ledgerEntryId) => $"ar:{ledgerEntryId:N}";

    public static string PrescriptionKey(Guid prescriptionId) => $"rx:{prescriptionId:N}";

    public static string SaleKey(Guid saleId) => $"sale:{saleId:N}";

    public static string Join(IEnumerable<string> keys) => string.Join(',', keys.Distinct(StringComparer.Ordinal).Take(MaxKeys));

    public static IReadOnlySet<string> Split(string? keys) =>
        string.IsNullOrWhiteSpace(keys)
            ? new HashSet<string>(StringComparer.Ordinal)
            : keys.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToHashSet(StringComparer.Ordinal);

    /// <summary>The keys already covered by a non-failed SMS created in the last <paramref name="windowDays"/> days.</summary>
    public static IReadOnlySet<string> Covered(IEnumerable<RecentSms> recent, DateTime nowUtc, int windowDays)
    {
        ArgumentNullException.ThrowIfNull(recent);
        DateTime since = nowUtc.AddDays(-Math.Max(1, windowDays));
        return recent
            .Where(r => r.Status != SmsStatus.Failed && r.CreatedAtUtc > since)
            .SelectMany(r => Split(r.ReferenceKeys))
            .ToHashSet(StringComparer.Ordinal);
    }

    /// <summary>The candidates whose key is not covered within the window.</summary>
    public static IReadOnlyList<T> Uncovered<T>(
        IEnumerable<T> candidates, Func<T, string> keyOf, IEnumerable<RecentSms> recent, DateTime nowUtc, int windowDays)
    {
        ArgumentNullException.ThrowIfNull(candidates);
        ArgumentNullException.ThrowIfNull(keyOf);
        var covered = Covered(recent, nowUtc, windowDays);
        return candidates.Where(c => !covered.Contains(keyOf(c))).ToList();
    }

    /// <summary>A hand-sent reminder to the same customer within this long (not failed) is refused as a double click.</summary>
    public static readonly TimeSpan ManualRepeatGuard = TimeSpan.FromHours(1);

    public static bool IsManualRepeat(IEnumerable<RecentSms> recent, DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(recent);
        return recent.Any(r => r.Status != SmsStatus.Failed && nowUtc - r.CreatedAtUtc < ManualRepeatGuard);
    }
}
