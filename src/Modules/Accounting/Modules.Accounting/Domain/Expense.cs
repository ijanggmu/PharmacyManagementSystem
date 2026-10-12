using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// A recorded business expense. Posts a system voucher (Dr General Expenses / Cr Cash or Bank,
/// depending on <see cref="PaymentMethod"/>) at the same time it's recorded — see
/// <c>RecordExpenseCommandHandler</c>.
/// </summary>
public sealed class Expense : AggregateRoot<Guid>
{
    public DateTime ExpenseDateUtc { get; private set; }
    public string Category { get; private set; } = default!;
    public decimal Amount { get; private set; }
    public string PaymentMethod { get; private set; } = default!;
    public string? Description { get; private set; }

    /// <summary>Supplier bill / receipt number the expense was paid against, for audit lookups. Optional.</summary>
    public string? ReceiptReference { get; private set; }
    public string RecordedBy { get; private set; } = default!;
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    /// <summary>Nullable — "NULL = legacy/tenant-wide" per docs/branch-scoping-plan.md §2, sourced via
    /// <c>ICurrentBranch.GetBranchIdAsync()</c>.</summary>
    public Guid? BranchId { get; private set; }

    private Expense() { }

    public static Expense Create(
        DateTime expenseDateUtc, string category, decimal amount, string paymentMethod, string? description, string recordedBy, Guid? branchId = null,
        string? receiptReference = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(category);
        ArgumentException.ThrowIfNullOrWhiteSpace(paymentMethod);
        ArgumentException.ThrowIfNullOrWhiteSpace(recordedBy);
        if (amount <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(amount), "Expense amount must be positive.");
        }

        return new Expense
        {
            Id = Guid.CreateVersion7(),
            ExpenseDateUtc = expenseDateUtc,
            Category = category.Trim(),
            Amount = amount,
            PaymentMethod = paymentMethod.Trim(),
            Description = description?.Trim(),
            RecordedBy = recordedBy.Trim(),
            ReceiptReference = NormalizeReference(receiptReference),
            CreatedAtUtc = DateTime.UtcNow,
            BranchId = branchId,
        };
    }

    /// <summary>Updates the recorded fields. The caller (handler) is responsible for reversing the
    /// original GL voucher and posting a new one to match — this only mutates the expense row
    /// itself (rule.md §9.1: no direct edits to posted vouchers).</summary>
    public void Update(string category, decimal amount, string paymentMethod, string? description, string? receiptReference = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(category);
        ArgumentException.ThrowIfNullOrWhiteSpace(paymentMethod);
        if (amount <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(amount), "Expense amount must be positive.");
        }

        Category = category.Trim();
        Amount = amount;
        PaymentMethod = paymentMethod.Trim();
        Description = description?.Trim();
        ReceiptReference = NormalizeReference(receiptReference);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Moves the expense to another date. The caller reverses the old voucher and posts the
    /// replacement at the new date.</summary>
    public void MoveTo(DateTime expenseDateUtc)
    {
        ExpenseDateUtc = expenseDateUtc;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    private static string? NormalizeReference(string? reference) =>
        string.IsNullOrWhiteSpace(reference) ? null : reference.Trim();
}
