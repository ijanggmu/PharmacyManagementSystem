using System.Globalization;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// Derives an account's code from its place in the chart tree, so the number reads root → parent → child:
/// <list type="bullet">
///   <item>Under a root head (code <c>d</c>): four digits in the head's block <c>d000–d999</c>, the next
///   free hundred after the highest code already used there (Assets: 1000, 1010, 1100, 1200 → 1300),
///   falling back to the next free ten, then any free number, once the hundreds run out.</item>
///   <item>Under any other account: the parent's code plus a two-digit sequence
///   (1300 → 130001, 130002 …; 130001 → 13000101).</item>
/// </list>
/// Codes in <c>taken</c> are never reused, so allocating against the current chart can't collide with
/// the unique code index — even while several accounts are recoded in one save.
/// </summary>
public static class AccountCodeAllocator
{
    public const int MaxCodeLength = 32;

    public static string NextChildCode(AccountingAccount parent, ISet<string> taken)
    {
        ArgumentNullException.ThrowIfNull(parent);
        ArgumentNullException.ThrowIfNull(taken);

        string code = parent.IsRootHead
            ? NextUnderRoot(parent.Code, taken)
            : NextUnderAccount(parent.Code, taken);

        taken.Add(code);
        return code;
    }

    /// <summary>
    /// The next free code in the cash &amp; bank block (<c>1000–1099</c>, beside Cash 1000 and Bank 1010), for a
    /// new till, bank or wallet account placed directly under the Assets head: the next free ten (1020, 1030 …)
    /// first, then any free number.
    /// </summary>
    public static string NextCashBankCode(ISet<string> taken)
    {
        ArgumentNullException.ThrowIfNull(taken);

        foreach (int step in new[] { 10, 1 })
        {
            for (int n = 1000 + step; n <= 1099; n += step)
            {
                string candidate = n.ToString(CultureInfo.InvariantCulture);
                if (taken.Add(candidate))
                {
                    return candidate;
                }
            }
        }

        throw new InvalidOperationException("The cash & bank block (1000–1099) has no free account numbers left.");
    }

    private static string NextUnderRoot(string rootCode, ISet<string> taken)
    {
        int digit = int.Parse(rootCode, CultureInfo.InvariantCulture);
        int low = digit * 1000;
        int high = low + 999;

        var used = taken
            .Where(c => c.Length == 4 && c[0] == rootCode[0] && c.All(char.IsAsciiDigit))
            .Select(c => int.Parse(c, CultureInfo.InvariantCulture))
            .ToList();

        int start = used.Count == 0 ? low : ((used.Max() / 100) + 1) * 100;
        foreach (int step in new[] { 100, 10, 1 })
        {
            int first = step == 100 ? start : low;
            for (int n = first; n <= high; n += step)
            {
                string candidate = n.ToString(CultureInfo.InvariantCulture);
                if (!taken.Contains(candidate))
                {
                    return candidate;
                }
            }
        }

        throw new InvalidOperationException($"Head {rootCode} has no free account numbers left ({low}–{high}).");
    }

    private static string NextUnderAccount(string parentCode, ISet<string> taken)
    {
        if (parentCode.Length + 2 > MaxCodeLength)
        {
            throw new InvalidOperationException(
                $"Account '{parentCode}' is nested too deeply to hold sub-accounts (codes are limited to {MaxCodeLength} characters).");
        }

        int highest = 0;
        foreach (string code in taken)
        {
            if (code.Length == parentCode.Length + 2
                && code.StartsWith(parentCode, StringComparison.Ordinal)
                && int.TryParse(code.AsSpan(parentCode.Length), NumberStyles.None, CultureInfo.InvariantCulture, out int seq))
            {
                highest = Math.Max(highest, seq);
            }
        }

        // Next after the highest used; wrap to the first gap once 99 is reached.
        IEnumerable<int> order = Enumerable.Range(highest + 1, Math.Max(0, 99 - highest)).Concat(Enumerable.Range(1, highest));
        foreach (int seq in order)
        {
            string candidate = parentCode + seq.ToString("D2", CultureInfo.InvariantCulture);
            if (!taken.Contains(candidate))
            {
                return candidate;
            }
        }

        throw new InvalidOperationException($"Account '{parentCode}' already has 99 sub-accounts.");
    }
}
