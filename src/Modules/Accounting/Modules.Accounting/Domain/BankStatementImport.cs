using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Accounting.Domain;

public enum BankStatementImportStatus
{
    Open = 0,
    Reconciled = 1,
}

/// <summary>Input for one statement line at creation time — same shape as the Next.js
/// <c>CreateBankStatementImportInput.lines[]</c> (bank-reconciliation-service.ts).</summary>
public sealed record BankStatementLineInput(
    DateTime TxnDateUtc, string? Description, string? Reference, decimal DebitAmount, decimal CreditAmount);

/// <summary>
/// A bank statement checked against a GL (asset) account's posted voucher lines — ported from the
/// Next.js <c>bank_statement_imports</c>/<c>bank_statement_lines</c> tables and
/// <c>bank-reconciliation-service.ts</c>. Distinct from the simpler point-in-time
/// <see cref="BankReconciliation"/> snapshot: this aggregate tracks line-level matching so an
/// operator can auto-match, manually match/unmatch/ignore individual lines, and only complete once
/// every line is accounted for.
/// </summary>
public sealed class BankStatementImport : AggregateRoot<Guid>
{
    private readonly List<BankStatementLine> _lines = [];

    public Guid AccountId { get; private set; }
    public string? StatementLabel { get; private set; }
    public DateTime PeriodStartUtc { get; private set; }
    public DateTime PeriodEndUtc { get; private set; }
    public decimal? OpeningBalance { get; private set; }
    public decimal? ClosingBalance { get; private set; }
    public BankStatementImportStatus Status { get; private set; } = BankStatementImportStatus.Open;
    public string CreatedBy { get; private set; } = default!;
    public DateTime CreatedAtUtc { get; private set; }
    public string? ReconciledBy { get; private set; }
    public DateTime? ReconciledAtUtc { get; private set; }

    /// <summary>Nullable — "NULL = legacy/tenant-wide" per docs/branch-scoping-plan.md §2, sourced via
    /// <c>ICurrentBranch.GetBranchIdAsync()</c>.</summary>
    public Guid? BranchId { get; private set; }

    public IReadOnlyList<BankStatementLine> Lines => _lines;

    private BankStatementImport() { }

    public static BankStatementImport Create(
        Guid accountId,
        string? statementLabel,
        DateTime periodStartUtc,
        DateTime periodEndUtc,
        decimal? openingBalance,
        decimal? closingBalance,
        IReadOnlyList<BankStatementLineInput> lines,
        string createdBy,
        Guid? branchId = null)
    {
        ArgumentNullException.ThrowIfNull(lines);
        ArgumentException.ThrowIfNullOrWhiteSpace(createdBy);

        if (periodEndUtc.Date < periodStartUtc.Date)
        {
            throw new CustomException(
                "Statement period end must be on or after the period start.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        var import = new BankStatementImport
        {
            Id = Guid.CreateVersion7(),
            AccountId = accountId,
            StatementLabel = statementLabel?.Trim(),
            PeriodStartUtc = periodStartUtc.Date,
            PeriodEndUtc = periodEndUtc.Date,
            OpeningBalance = openingBalance,
            ClosingBalance = closingBalance,
            Status = BankStatementImportStatus.Open,
            CreatedBy = createdBy.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
            BranchId = branchId,
        };

        int lineNo = 0;
        foreach (var line in lines)
        {
            lineNo++;
            if ((line.DebitAmount > 0) == (line.CreditAmount > 0))
            {
                throw new CustomException(
                    $"Line {lineNo}: exactly one of money-in (debit) or money-out (credit) must be positive.",
                    (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            if (line.TxnDateUtc.Date < import.PeriodStartUtc || line.TxnDateUtc.Date > import.PeriodEndUtc)
            {
                throw new CustomException(
                    $"Line {lineNo}: transaction date {line.TxnDateUtc:yyyy-MM-dd} is outside the statement period.",
                    (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            var created = BankStatementLine.Create(
                lineNo, line.TxnDateUtc.Date, line.Description, line.Reference, line.DebitAmount, line.CreditAmount);
            created.AssignImport(import.Id);
            import._lines.Add(created);
        }

        return import;
    }

    public void MatchLine(Guid lineId, Guid voucherLineId, string matchedBy)
    {
        ArgumentNullException.ThrowIfNull(matchedBy);
        EnsureOpen();
        var line = FindLine(lineId);
        if (line.Status == BankStatementLineStatus.Matched)
        {
            throw new CustomException(
                "This line is already matched — unmatch it first.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        line.Match(voucherLineId, matchedBy);
    }

    public void UnmatchLine(Guid lineId)
    {
        EnsureOpen();
        FindLine(lineId).Unmatch();
    }

    public void IgnoreLine(Guid lineId, string? note)
    {
        EnsureOpen();
        FindLine(lineId).Ignore(note);
    }

    /// <summary>Completes the reconciliation. The caller must already have verified there are no
    /// outstanding, unmatched GL lines for the period (a cross-aggregate check the handler performs
    /// via the ledger) — this only enforces the statement side of the invariant.</summary>
    public void Complete(string reconciledBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reconciledBy);
        EnsureOpen();

        int unmatched = _lines.Count(l => l.Status == BankStatementLineStatus.Unmatched);
        if (unmatched > 0)
        {
            throw new CustomException(
                $"{unmatched} statement line(s) are still unmatched. Match or ignore every line before completing.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Status = BankStatementImportStatus.Reconciled;
        ReconciledBy = reconciledBy.Trim();
        ReconciledAtUtc = DateTime.UtcNow;
    }

    private BankStatementLine FindLine(Guid lineId) =>
        _lines.FirstOrDefault(l => l.Id == lineId)
        ?? throw new NotFoundException($"Statement line {lineId} not found on this import.");

    private void EnsureOpen()
    {
        if (Status != BankStatementImportStatus.Open)
        {
            throw new CustomException(
                "This statement is already reconciled.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
