using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;

namespace FSH.Modules.Accounting.Domain;

/// <summary>Which change an <see cref="OpeningBalanceHistoryEntry"/> records.</summary>
public enum OpeningBalanceAction
{
    Set = 0,
    Edit = 1,
    Reset = 2,
}

/// <summary>One account's opening balance, with the code/name it had when recorded.</summary>
public sealed record OpeningBalanceEntry(
    Guid AccountId, string AccountCode, string AccountName, string AccountType, decimal DebitAmount, decimal CreditAmount);

/// <summary>Before → after amounts for one account in a history entry.</summary>
public sealed record OpeningBalanceChange(
    Guid AccountId, string AccountCode, string AccountName,
    decimal BeforeDebit, decimal BeforeCredit, decimal AfterDebit, decimal AfterCredit);

/// <summary>A voucher line to post: account, description, debit, credit.</summary>
public sealed record OpeningBalanceVoucherLine(Guid AccountId, string Description, decimal DebitAmount, decimal CreditAmount);

/// <summary>
/// Pure rules for opening balances (no I/O), shared by the handlers and their tests.
/// <para>
/// Balancing: the entered lines rarely balance on their own (a pharmacy knows its cash, stock and
/// payables, not its equity). The difference is posted to Owner's Equity (code 3000, the same plug
/// the onboarding migration wizard uses; the seeded chart has no separate "opening balance equity"
/// account), so the voucher itself always balances.
/// </para>
/// </summary>
public static class OpeningBalanceRules
{
    public const string VoucherType = "opening_balance";
    public const string ReferenceType = "OpeningBalance";
    public const string DifferenceDescription = "Opening balance difference";
    public const int MaxReasonLength = 500;
    public const int MaxLines = 500;

    /// <summary>Only balance-sheet heads carry opening balances.</summary>
    public static bool IsBalanceSheetType(AccountingAccountType type) =>
        type is AccountingAccountType.Asset or AccountingAccountType.Liability or AccountingAccountType.Equity;

    /// <summary>Rejects an empty set, negative amounts, two-sided or zero lines, more than two decimals and duplicate accounts.</summary>
    public static void ValidateLines(IReadOnlyCollection<OpeningBalanceEntry> lines)
    {
        ArgumentNullException.ThrowIfNull(lines);

        if (lines.Count == 0)
        {
            throw BadRequest("Enter at least one opening balance.");
        }

        if (lines.Count > MaxLines)
        {
            throw BadRequest($"At most {MaxLines} accounts can be entered.");
        }

        var problems = new List<string>();
        foreach (var line in lines)
        {
            if (line.DebitAmount < 0 || line.CreditAmount < 0)
            {
                problems.Add($"{line.AccountCode} {line.AccountName}: amounts cannot be negative.");
            }
            else if ((line.DebitAmount > 0) == (line.CreditAmount > 0))
            {
                problems.Add($"{line.AccountCode} {line.AccountName}: enter either a debit or a credit amount, not both or neither.");
            }
            else if (decimal.Round(line.DebitAmount + line.CreditAmount, 2) != line.DebitAmount + line.CreditAmount)
            {
                problems.Add($"{line.AccountCode} {line.AccountName}: amounts can have at most 2 decimal places.");
            }
        }

        problems.AddRange(lines
            .GroupBy(l => l.AccountId)
            .Where(g => g.Count() > 1)
            .Select(g => $"{g.First().AccountCode} {g.First().AccountName} is entered more than once."));

        if (problems.Count > 0)
        {
            throw new CustomException(
                problems.Count == 1 ? problems[0] : $"{problems.Count} opening balance lines are invalid. {string.Join(" ", problems)}",
                problems, HttpStatusCode.BadRequest);
        }
    }

    /// <summary>
    /// Refuses GL opening amounts on the control accounts whose opening comes from a subledger —
    /// Accounts Receivable (per-customer opening balances), Accounts Payable (per-supplier opening
    /// balances) and Inventory (opening stock); see <c>AccountingControlAccounts.FedBySubledgerOpenings</c>.
    /// Entering them here as well would count the same opening twice.
    /// <para>
    /// Data safety: an opening set before this rule may already carry such a line. An edit may keep it
    /// exactly as it is (<paramref name="carriedOver"/>, the current entries) or remove it; only a new or
    /// changed amount is refused. Nothing already posted is touched.
    /// </para>
    /// </summary>
    public static void EnsureNoSubledgerControlLines(
        IReadOnlyCollection<OpeningBalanceEntry> lines,
        IReadOnlySet<Guid> subledgerControlAccountIds,
        IReadOnlyCollection<OpeningBalanceEntry> carriedOver)
    {
        ArgumentNullException.ThrowIfNull(lines);
        ArgumentNullException.ThrowIfNull(subledgerControlAccountIds);
        ArgumentNullException.ThrowIfNull(carriedOver);

        var before = carriedOver
            .GroupBy(l => l.AccountId)
            .ToDictionary(g => g.Key, g => g.First());

        var problems = lines
            .Where(l => subledgerControlAccountIds.Contains(l.AccountId))
            .Where(l => !before.TryGetValue(l.AccountId, out var b) || b.DebitAmount != l.DebitAmount || b.CreditAmount != l.CreditAmount)
            .OrderBy(l => l.AccountCode, StringComparer.Ordinal)
            .Select(l => $"{l.AccountCode} {l.AccountName}: {SubledgerOpeningHint(l.AccountCode)}")
            .ToList();

        if (problems.Count > 0)
        {
            throw new CustomException(
                problems.Count == 1
                    ? $"This account's opening balance comes from its subledger, so it can't be entered here. {problems[0]}"
                    : $"{problems.Count} accounts take their opening balance from a subledger and can't be entered here. {string.Join(" ", problems)}",
                problems, HttpStatusCode.BadRequest);
        }
    }

    private static string SubledgerOpeningHint(string accountCode) => accountCode switch
    {
        AccountingSystemAccountCodes.AccountsReceivable => "enter what each customer owed as that customer's opening balance.",
        AccountingSystemAccountCodes.AccountsPayable => "enter what you owed each supplier as that supplier's opening balance.",
        AccountingSystemAccountCodes.Inventory => "enter stock on hand as opening stock for each medicine.",
        _ => "record it through its subledger.",
    };

    public static (decimal Debit, decimal Credit) Totals(IEnumerable<OpeningBalanceEntry> lines)
    {
        ArgumentNullException.ThrowIfNull(lines);
        decimal debit = 0m;
        decimal credit = 0m;
        foreach (var line in lines)
        {
            debit += line.DebitAmount;
            credit += line.CreditAmount;
        }

        return (debit, credit);
    }

    /// <summary>The Owner's Equity line that makes the voucher balance: a credit when debits exceed credits, a debit otherwise.</summary>
    public static (decimal Debit, decimal Credit) EquityAdjustment(IEnumerable<OpeningBalanceEntry> lines)
    {
        var (debit, credit) = Totals(lines);
        decimal difference = debit - credit;
        return difference > 0 ? (0m, difference) : (-difference, 0m);
    }

    /// <summary>Voucher lines: one per entered account (code order) plus the equity difference line when
    /// non-zero. Σ debit always equals Σ credit.</summary>
    public static IReadOnlyList<OpeningBalanceVoucherLine> BuildVoucherLines(
        IReadOnlyCollection<OpeningBalanceEntry> lines, Guid equityAccountId)
    {
        ValidateLines(lines);

        var result = lines
            .OrderBy(l => l.AccountCode, StringComparer.Ordinal)
            .Select(l => new OpeningBalanceVoucherLine(l.AccountId, "Opening balance", l.DebitAmount, l.CreditAmount))
            .ToList();

        var (adjDebit, adjCredit) = EquityAdjustment(lines);
        if (adjDebit > 0 || adjCredit > 0)
        {
            result.Add(new OpeningBalanceVoucherLine(equityAccountId, DifferenceDescription, adjDebit, adjCredit));
        }

        return result;
    }

    /// <summary>Accounts whose amounts differ between <paramref name="before"/> and <paramref name="after"/>,
    /// in code order. Unchanged accounts are left out.</summary>
    public static IReadOnlyList<OpeningBalanceChange> BuildChanges(
        IReadOnlyCollection<OpeningBalanceEntry> before, IReadOnlyCollection<OpeningBalanceEntry> after)
    {
        ArgumentNullException.ThrowIfNull(before);
        ArgumentNullException.ThrowIfNull(after);

        var beforeById = before.ToDictionary(l => l.AccountId);
        var afterById = after.ToDictionary(l => l.AccountId);

        return beforeById.Keys.Union(afterById.Keys)
            .Select(id =>
            {
                beforeById.TryGetValue(id, out var b);
                afterById.TryGetValue(id, out var a);
                var label = a ?? b!;
                return new OpeningBalanceChange(
                    id, label.AccountCode, label.AccountName,
                    b?.DebitAmount ?? 0m, b?.CreditAmount ?? 0m, a?.DebitAmount ?? 0m, a?.CreditAmount ?? 0m);
            })
            .Where(c => c.BeforeDebit != c.AfterDebit || c.BeforeCredit != c.AfterCredit)
            .OrderBy(c => c.AccountCode, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>A reason is mandatory for Edit and Reset; trimmed, at most <see cref="MaxReasonLength"/> characters.</summary>
    public static string RequireReason(string? reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            throw BadRequest("A reason is required to edit or reset opening balances.");
        }

        string trimmed = reason.Trim();
        if (trimmed.Length > MaxReasonLength)
        {
            throw BadRequest($"The reason can be at most {MaxReasonLength} characters.");
        }

        return trimmed;
    }

    private static CustomException BadRequest(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
}
