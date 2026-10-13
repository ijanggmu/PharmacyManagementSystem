using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// A point-in-time comparison between a cash/bank account's GL balance and the actual bank statement
/// balance the operator read off a statement. No line-level statement import/matching — just the
/// variance, for follow-up. Append-only (never edited after creation, matching Suppliers/Customers'
/// ledger-entry convention).
/// </summary>
public sealed class BankReconciliation : AggregateRoot<Guid>
{
    public DateTime AsOfUtc { get; private set; }
    public decimal GlBalance { get; private set; }
    public decimal StatementBalance { get; private set; }
    public decimal Variance { get; private set; }
    public string? Notes { get; private set; }
    public string ReconciledBy { get; private set; } = default!;
    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>Nullable — "NULL = legacy/tenant-wide" per docs/branch-scoping-plan.md §2, sourced via
    /// <c>ICurrentBranch.GetBranchIdAsync()</c>.</summary>
    public Guid? BranchId { get; private set; }

    /// <summary>The cash/bank account reconciled. Null on reconciliations made before the account was
    /// selectable — those were all of Bank (1010).</summary>
    public Guid? AccountId { get; private set; }

    private BankReconciliation() { }

    public static BankReconciliation Create(
        DateTime asOfUtc, decimal glBalance, decimal statementBalance, string? notes, string reconciledBy, Guid? branchId = null,
        Guid? accountId = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reconciledBy);

        return new BankReconciliation
        {
            Id = Guid.CreateVersion7(),
            AsOfUtc = asOfUtc,
            GlBalance = glBalance,
            StatementBalance = statementBalance,
            Variance = statementBalance - glBalance,
            Notes = notes?.Trim(),
            ReconciledBy = reconciledBy.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
            BranchId = branchId,
            AccountId = accountId,
        };
    }
}
