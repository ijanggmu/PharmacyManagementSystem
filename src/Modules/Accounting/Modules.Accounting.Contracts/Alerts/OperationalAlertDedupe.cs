using System.Globalization;

namespace FSH.Modules.Accounting.Contracts.Alerts;

/// <summary>Operational alert categories (also the notification <c>Type</c> suffix: <c>ops.low_stock</c>, …).</summary>
public static class OperationalAlertCategories
{
    public const string LowStock = "low_stock";
    public const string ExpiringBatches = "expiring_batches";
    public const string PayablesOverdue = "payables_overdue";
    public const string ReceivablesOverdue = "receivables_overdue";

    /// <summary>Post-dated cheques whose date has come: received ones to bank, issued ones the bank may now pay.</summary>
    public const string ChequesDue = "cheques_due";

    public static readonly IReadOnlyList<string> All = [LowStock, ExpiringBatches, PayablesOverdue, ReceivablesOverdue, ChequesDue];

    /// <summary>The bell notification type for a category.</summary>
    public static string NotificationType(string category) => $"ops.{category}";
}

/// <summary>
/// De-duplication of operational alert digests, shared by the publisher (Accounting's scan) and the consumer
/// (Notifications), so both read the same key format. A digest's key is
/// <c>ops:{category}:{scope}:{yyyyMMdd}:{signature}</c> and is stored on each user's notification. A new digest is
/// suppressed for a user who already has, for the same category and scope,
/// <list type="bullet">
///   <item>any digest dated the same day — at most one digest per category a day, however often the scan runs; or</item>
///   <item>a digest with the same signature (the same items) within the last <c>repeatAfterDays</c> days — an
///   unchanged list is not repeated every morning, only as a weekly-style reminder.</item>
/// </list>
/// </summary>
public static class OperationalAlertDedupe
{
    public const string AllBranchesScope = "all";

    public static string ScopeKey(Guid? branchId) => branchId is { } id ? id.ToString("N") : AllBranchesScope;

    /// <summary>Prefix shared by every digest of a category + scope (what the consumer queries by).</summary>
    public static string Prefix(string category, string scopeKey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(category);
        ArgumentException.ThrowIfNullOrWhiteSpace(scopeKey);
        return $"ops:{category}:{scopeKey}:";
    }

    public static string Key(string category, string scopeKey, DateOnly date, string signature)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(signature);
        return Prefix(category, scopeKey) + date.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + ":" + signature;
    }

    /// <summary>
    /// Whether a digest (<paramref name="category"/>, <paramref name="scopeKey"/>, <paramref name="date"/>,
    /// <paramref name="signature"/>) must NOT be delivered to a user who already holds
    /// <paramref name="existingKeys"/> (their earlier digest keys; keys of other categories/scopes and malformed
    /// keys are ignored).
    /// </summary>
    public static bool IsSuppressed(
        IEnumerable<string> existingKeys,
        string category,
        string scopeKey,
        DateOnly date,
        string signature,
        int repeatAfterDays)
    {
        ArgumentNullException.ThrowIfNull(existingKeys);
        string prefix = Prefix(category, scopeKey);
        int window = Math.Max(1, repeatAfterDays);

        foreach (string key in existingKeys)
        {
            if (key is null || !key.StartsWith(prefix, StringComparison.Ordinal))
            {
                continue;
            }

            // Remainder: "yyyyMMdd:signature".
            string rest = key[prefix.Length..];
            int colon = rest.IndexOf(':', StringComparison.Ordinal);
            if (colon != 8 || !DateOnly.TryParseExact(rest[..colon], "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var sentOn))
            {
                continue;
            }

            if (sentOn == date)
            {
                return true; // already had today's digest for this category
            }

            int ageDays = date.DayNumber - sentOn.DayNumber;
            if (ageDays > 0 && ageDays < window && string.Equals(rest[(colon + 1)..], signature, StringComparison.Ordinal))
            {
                return true; // same items, reminded recently
            }
        }

        return false;
    }
}
