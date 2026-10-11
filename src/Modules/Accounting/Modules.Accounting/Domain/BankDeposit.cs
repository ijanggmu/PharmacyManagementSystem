using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// Records moving cash into the bank (till takings, a card-settlement batch, etc.). Posts a system
/// voucher (Dr Bank / Cr Cash) via <c>IVoucherPostingService</c> at the same time it's recorded — see
/// <c>RecordBankDepositCommandHandler</c>.
/// </summary>
public sealed class BankDeposit : AggregateRoot<Guid>
{
    public DateTime DepositDateUtc { get; private set; }
    public decimal Amount { get; private set; }
    public string? Description { get; private set; }
    public string RecordedBy { get; private set; } = default!;
    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>Required — a bank deposit is always attributed to exactly one branch, resolved via
    /// <c>ICurrentBranch.RequireBranchIdAsync()</c> in the command handler (docs/branch-scoping-plan.md
    /// §2: transactional entities are never left unscoped).</summary>
    public Guid BranchId { get; private set; }

    private BankDeposit() { }

    public static BankDeposit Create(DateTime depositDateUtc, decimal amount, string? description, string recordedBy, Guid branchId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(recordedBy);
        if (amount <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(amount), "Deposit amount must be positive.");
        }

        if (branchId == Guid.Empty)
        {
            throw new ArgumentException("Branch id must be a valid, non-empty branch.", nameof(branchId));
        }

        return new BankDeposit
        {
            Id = Guid.CreateVersion7(),
            DepositDateUtc = depositDateUtc,
            Amount = amount,
            Description = description?.Trim(),
            RecordedBy = recordedBy.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
            BranchId = branchId,
        };
    }
}
