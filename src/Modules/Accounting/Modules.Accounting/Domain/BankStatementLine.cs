using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

public enum BankStatementLineStatus
{
    Unmatched = 0,
    Matched = 1,
    Ignored = 2,
}

/// <summary>
/// One line of an imported bank statement. Reached ONLY through <see cref="BankStatementImport"/>'s
/// navigation collection — needs <c>ValueGeneratedNever()</c> in its EF config, same footgun as
/// <see cref="AccountingVoucherLine"/> (database.md).
/// </summary>
public sealed class BankStatementLine : BaseEntity<Guid>
{
    public Guid ImportId { get; private set; }
    public int LineNo { get; private set; }
    public DateTime TxnDateUtc { get; private set; }
    public string? Description { get; private set; }
    public string? Reference { get; private set; }

    /// <summary>Direction mirrors the GL: money into the bank account is a debit.</summary>
    public decimal DebitAmount { get; private set; }
    public decimal CreditAmount { get; private set; }

    public BankStatementLineStatus Status { get; private set; } = BankStatementLineStatus.Unmatched;
    public Guid? MatchedVoucherLineId { get; private set; }
    public DateTime? MatchedAtUtc { get; private set; }
    public string? MatchedBy { get; private set; }
    public string? Note { get; private set; }

    private BankStatementLine() { }

    internal static BankStatementLine Create(
        int lineNo, DateTime txnDateUtc, string? description, string? reference, decimal debitAmount, decimal creditAmount)
    {
        return new BankStatementLine
        {
            Id = Guid.CreateVersion7(),
            LineNo = lineNo,
            TxnDateUtc = txnDateUtc,
            Description = description?.Trim(),
            Reference = reference?.Trim(),
            DebitAmount = debitAmount,
            CreditAmount = creditAmount,
            Status = BankStatementLineStatus.Unmatched,
        };
    }

    internal void AssignImport(Guid importId) => ImportId = importId;

    internal void Match(Guid voucherLineId, string matchedBy)
    {
        Status = BankStatementLineStatus.Matched;
        MatchedVoucherLineId = voucherLineId;
        MatchedAtUtc = DateTime.UtcNow;
        MatchedBy = matchedBy.Trim();
        Note = null;
    }

    internal void Unmatch()
    {
        Status = BankStatementLineStatus.Unmatched;
        MatchedVoucherLineId = null;
        MatchedAtUtc = null;
        MatchedBy = null;
    }

    internal void Ignore(string? note)
    {
        Status = BankStatementLineStatus.Ignored;
        MatchedVoucherLineId = null;
        MatchedAtUtc = null;
        MatchedBy = null;
        Note = note?.Trim();
    }
}
