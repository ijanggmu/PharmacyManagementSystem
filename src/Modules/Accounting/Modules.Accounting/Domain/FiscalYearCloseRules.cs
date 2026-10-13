namespace FSH.Modules.Accounting.Domain;

/// <summary>One revenue or expense account's cumulative debit and credit up to the end of the year being closed.</summary>
public sealed record ProfitAndLossBalance(Guid AccountId, decimal TotalDebit, decimal TotalCredit);

/// <summary>A line of a closing voucher.</summary>
public sealed record ClosingLine(Guid AccountId, decimal DebitAmount, decimal CreditAmount);

/// <summary>
/// Pure rules for the year-end close: which voucher type marks a closing entry, and the lines that zero every
/// revenue and expense account into Retained Earnings.
/// </summary>
public static class FiscalYearCloseRules
{
    /// <summary>Voucher type of a closing entry. Numbered in the journal (JV) series. Period reports (P&amp;L, period
    /// activity) leave these vouchers — and reversals of them — out so a closed year still shows its real figures;
    /// balance (as-of) reports include them, so revenue and expense read zero after the close and the profit sits in
    /// Retained Earnings.</summary>
    public const string VoucherType = "system_year_end_close";

    /// <summary>Reference type stamped on closing vouchers (the reference id is left empty: a close posts one voucher
    /// per branch, and the posted-reference unique index allows one voucher per reference).</summary>
    public const string ReferenceType = "fiscal_year_close";

    /// <summary>
    /// The closing lines for one branch: each account with a non-zero balance is posted on the opposite side for
    /// exactly that balance (revenue is debited, expense credited, contra balances the other way round), and the net
    /// goes to <paramref name="retainedEarningsAccountId"/> — credited for a profit, debited for a loss. Returns no
    /// lines when every balance is already zero. <c>NetProfit</c> is Σ(credit − debit) over the accounts.
    /// </summary>
    public static (IReadOnlyList<ClosingLine> Lines, decimal NetProfit) BuildClosingLines(
        IEnumerable<ProfitAndLossBalance> balances, Guid retainedEarningsAccountId)
    {
        ArgumentNullException.ThrowIfNull(balances);

        var lines = new List<ClosingLine>();
        decimal netProfit = 0m;
        foreach (var balance in balances.OrderBy(b => b.AccountId))
        {
            decimal net = AccountingVoucher.RoundAmount(balance.TotalDebit - balance.TotalCredit);
            if (net == 0m)
            {
                continue;
            }

            // A debit balance (expense, or revenue reduced by returns) is cleared with a credit, and vice versa.
            lines.Add(net > 0m
                ? new ClosingLine(balance.AccountId, 0m, net)
                : new ClosingLine(balance.AccountId, -net, 0m));
            netProfit -= net;
        }

        if (lines.Count == 0)
        {
            return ([], 0m);
        }

        if (netProfit > 0m)
        {
            lines.Add(new ClosingLine(retainedEarningsAccountId, 0m, netProfit));
        }
        else if (netProfit < 0m)
        {
            lines.Add(new ClosingLine(retainedEarningsAccountId, -netProfit, 0m));
        }

        return (lines, netProfit);
    }
}
