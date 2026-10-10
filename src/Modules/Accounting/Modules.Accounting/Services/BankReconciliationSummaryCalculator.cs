using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Services;

/// <summary>One posted GL line on the reconciled account, flagged with whether some statement line
/// (of any import) already claims it — mirrors <c>LedgerCandidate.matched</c> in the Next.js
/// bank-reconciliation-service.ts.</summary>
public sealed record BankLedgerCandidateView(BankLedgerLine Ledger, bool Matched);

/// <summary>Mirrors <c>ReconciliationView.summary</c> in bank-reconciliation-service.ts.</summary>
public sealed record BankReconciliationSummaryView(
    decimal StatementDebits,
    decimal StatementCredits,
    decimal StatementNet,
    decimal LedgerDebits,
    decimal LedgerCredits,
    decimal LedgerNet,
    decimal Difference,
    int UnmatchedStatementLines,
    int UnmatchedLedgerLines);

/// <summary>Builds the shared "statement vs GL" view (ledger candidates + summary) that
/// <c>GetBankStatementImportById</c>, <c>AutoMatchBankStatementImport</c>, and
/// <c>CompleteBankStatementImport</c> all need — ported from <c>getBankReconciliation</c> in the
/// Next.js bank-reconciliation-service.ts.</summary>
public static class BankReconciliationSummaryCalculator
{
    public static (IReadOnlyList<BankLedgerCandidateView> Candidates, BankReconciliationSummaryView Summary) Build(
        IReadOnlyList<BankStatementLine> statementLines,
        IReadOnlyList<BankLedgerLine> ledgerLines,
        IReadOnlySet<Guid> claimedVoucherLineIds)
    {
        ArgumentNullException.ThrowIfNull(statementLines);
        ArgumentNullException.ThrowIfNull(ledgerLines);
        ArgumentNullException.ThrowIfNull(claimedVoucherLineIds);

        var candidates = ledgerLines
            .Select(l => new BankLedgerCandidateView(l, claimedVoucherLineIds.Contains(l.VoucherLineId)))
            .ToList();

        var active = statementLines.Where(l => l.Status != BankStatementLineStatus.Ignored).ToList();

        decimal statementDebits = decimal.Round(active.Sum(l => l.DebitAmount), 2);
        decimal statementCredits = decimal.Round(active.Sum(l => l.CreditAmount), 2);
        decimal ledgerDebits = decimal.Round(ledgerLines.Sum(l => l.DebitAmount), 2);
        decimal ledgerCredits = decimal.Round(ledgerLines.Sum(l => l.CreditAmount), 2);
        decimal statementNet = decimal.Round(statementDebits - statementCredits, 2);
        decimal ledgerNet = decimal.Round(ledgerDebits - ledgerCredits, 2);

        var summary = new BankReconciliationSummaryView(
            statementDebits,
            statementCredits,
            statementNet,
            ledgerDebits,
            ledgerCredits,
            ledgerNet,
            decimal.Round(statementNet - ledgerNet, 2),
            statementLines.Count(l => l.Status == BankStatementLineStatus.Unmatched),
            candidates.Count(c => !c.Matched));

        return (candidates, summary);
    }
}
