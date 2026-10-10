namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Levenshtein edit distance — ported 1:1 from the `levenshtein` helper in
/// lib/server/services/medicine-service.ts (small inputs only, e.g. medicine names — no
/// external dependency needed).
/// </summary>
internal static class LevenshteinDistanceCalculator
{
    public static int Distance(string a, string b)
    {
        ArgumentNullException.ThrowIfNull(a);
        ArgumentNullException.ThrowIfNull(b);

        int m = a.Length;
        int n = b.Length;
        if (m == 0)
        {
            return n;
        }

        if (n == 0)
        {
            return m;
        }

        var prev = new int[n + 1];
        var curr = new int[n + 1];
        for (int j = 0; j <= n; j++)
        {
            prev[j] = j;
        }

        for (int i = 1; i <= m; i++)
        {
            curr[0] = i;
            for (int j = 1; j <= n; j++)
            {
                int cost = a[i - 1] == b[j - 1] ? 0 : 1;
                curr[j] = Math.Min(Math.Min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }

            for (int j = 0; j <= n; j++)
            {
                prev[j] = curr[j];
            }
        }

        return prev[n];
    }
}
