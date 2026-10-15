namespace FSH.Modules.Accounting.Domain;

/// <summary>A posted GL voucher line on the reconciled account, offered as a candidate match.
/// Pure value object — no EF/DbContext dependency, so the matching algorithm below is unit
/// testable without a database.</summary>
public sealed record LedgerMatchCandidate(Guid VoucherLineId, DateTime VoucherDateUtc, decimal DebitAmount, decimal CreditAmount);

/// <summary>One proposed pairing the caller should apply via <see cref="BankStatementImport.MatchLine"/>.</summary>
public sealed record AutoMatchResult(Guid StatementLineId, Guid VoucherLineId);

/// <summary>
/// Ported from <c>autoMatchBankStatement</c> in the Next.js
/// <c>lib/server/services/bank-reconciliation-service.ts</c>: pairs unmatched statement lines with
/// unclaimed GL candidates on exact amount + direction, nearest date first, within a tolerance
/// window. Deliberately conservative — an ambiguous amount (two candidates equally close) is left
/// for a human rather than guessed at, since a wrong auto-match silently hides a real discrepancy.
/// </summary>
public static class BankStatementAutoMatcher
{
    public const int DefaultDateToleranceDays = 3;

    public static IReadOnlyList<AutoMatchResult> Match(
        IReadOnlyList<BankStatementLine> statementLines,
        IReadOnlyList<LedgerMatchCandidate> candidates,
        int dateToleranceDays = DefaultDateToleranceDays)
    {
        ArgumentNullException.ThrowIfNull(statementLines);
        ArgumentNullException.ThrowIfNull(candidates);

        var claimed = new HashSet<Guid>();
        var results = new List<AutoMatchResult>();

        foreach (var line in statementLines)
        {
            if (line.Status != BankStatementLineStatus.Unmatched)
            {
                continue;
            }

            var ranked = candidates
                .Where(c =>
                    !claimed.Contains(c.VoucherLineId) &&
                    decimal.Round(c.DebitAmount, 2) == decimal.Round(line.DebitAmount, 2) &&
                    decimal.Round(c.CreditAmount, 2) == decimal.Round(line.CreditAmount, 2) &&
                    DaysApart(c.VoucherDateUtc, line.TxnDateUtc) <= dateToleranceDays)
                .OrderBy(c => DaysApart(c.VoucherDateUtc, line.TxnDateUtc))
                .ToList();

            if (ranked.Count == 0)
            {
                continue;
            }

            // Ambiguous: two candidates sit the same distance from the statement date and are
            // indistinguishable on amount. Picking one would be a coin flip.
            if (ranked.Count > 1 && DaysApart(ranked[0].VoucherDateUtc, line.TxnDateUtc) == DaysApart(ranked[1].VoucherDateUtc, line.TxnDateUtc))
            {
                continue;
            }

            var chosen = ranked[0];
            claimed.Add(chosen.VoucherLineId);
            results.Add(new AutoMatchResult(line.Id, chosen.VoucherLineId));
        }

        return results;
    }

    /// <summary>Days between a voucher instant (compared as its Nepal day) and a statement line's calendar date.</summary>
    private static int DaysApart(DateTime voucherDateUtc, DateTime txnDate) =>
        Math.Abs(Services.NepalDate.FromUtc(voucherDateUtc).DayNumber - DateOnly.FromDateTime(txnDate).DayNumber);
}
