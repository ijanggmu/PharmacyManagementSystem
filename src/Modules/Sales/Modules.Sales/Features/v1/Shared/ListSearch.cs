namespace FSH.Modules.Sales.Features.v1.Shared;

/// <summary>
/// Parsing helpers shared by the sales, returns and refunds list searches. Values are normalized to
/// upper-invariant; the database side compares against <c>column.ToUpper()</c> (SQL <c>upper()</c>),
/// which works the same on PostgreSQL and the EF InMemory provider used by the tests.
/// </summary>
internal static class ListSearch
{
    /// <summary>Justification shared by the CA1304/CA1311/CA1862 suppressions on EF predicates.</summary>
    public const string EfTranslatedCaseFold =
        "Inside an EF Core expression tree: ToUpper() translates to SQL upper(); the culture and StringComparison overloads are not translatable.";

    /// <summary>Upper-cased, trimmed search text, or null when blank.</summary>
    public static string? Normalize(string? search) =>
        string.IsNullOrWhiteSpace(search) ? null : search.Trim().ToUpperInvariant();

    /// <summary>
    /// The id prefix (upper-case) a normalized search term stands for, or null when it is not one. Lists
    /// label rows <c>{PREFIX}-{first 8 hex digits of the id}</c> (e.g. "SALE-3F2A9C1E"), so the label, the
    /// bare hex, or a whole id all match. A labelled term needs 4+ hex digits; a bare one needs the full
    /// 8 so a short number (an invoice-number fragment) doesn't match every id from the same time window.
    /// </summary>
    public static string? IdPrefix(string normalizedTerm, params string[] labelPrefixes)
    {
        string candidate = normalizedTerm;
        int minLength = 8;
        foreach (var label in labelPrefixes)
        {
            string withDash = label + "-";
            if (candidate.StartsWith(withDash, StringComparison.OrdinalIgnoreCase))
            {
                candidate = candidate[withDash.Length..];
                minLength = 4;
                break;
            }
        }

        if (candidate.Length < minLength || candidate.Length > 36)
        {
            return null;
        }

        foreach (char c in candidate)
        {
            if (c != '-' && !char.IsAsciiHexDigit(c))
            {
                return null;
            }
        }

        return candidate.ToUpperInvariant();
    }

    /// <summary>Distinct upper-cased values, accepting both a list and comma-separated entries.</summary>
    public static IReadOnlyList<string> SplitValues(IReadOnlyList<string>? values)
    {
        if (values is null || values.Count == 0)
        {
            return [];
        }

        return values
            .SelectMany(v => (v ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Select(v => v.ToUpperInvariant())
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    public static bool IsAscending(string? sortOrder) =>
        string.Equals(sortOrder?.Trim(), "asc", StringComparison.OrdinalIgnoreCase);

    /// <summary>Upper-cased sort field, or null when none was given.</summary>
    public static string? NormalizeSortField(string? sortBy) =>
        string.IsNullOrWhiteSpace(sortBy) ? null : sortBy.Trim().ToUpperInvariant();

    /// <summary>True when <paramref name="value"/> is null or one of <paramref name="allowed"/> (case-insensitive).</summary>
    public static bool IsNullOrOneOf(string? value, IReadOnlyList<string> allowed) =>
        value is null || allowed.Contains(value.Trim(), StringComparer.OrdinalIgnoreCase);
}
