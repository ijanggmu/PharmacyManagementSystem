using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// Reached ONLY through <see cref="AccountingVoucher"/>'s navigation collection — needs
/// <c>ValueGeneratedNever()</c> in its EF config (database.md nav-child footgun), same as
/// Catalog's <c>ProductImage</c>.
/// </summary>
public sealed class AccountingVoucherLine : BaseEntity<Guid>
{
    public Guid VoucherId { get; private set; }
    public int LineNo { get; private set; }
    public Guid AccountId { get; private set; }
    public string? Description { get; private set; }
    public decimal DebitAmount { get; private set; }
    public decimal CreditAmount { get; private set; }

    /// <summary>Nullable — mirrors the parent <see cref="AccountingVoucher"/>'s <see cref="AccountingVoucher.BranchId"/>;
    /// stamped at <see cref="AccountingVoucher.AddLine"/> time so a line never drifts from its voucher's branch.</summary>
    public Guid? BranchId { get; private set; }

    private AccountingVoucherLine() { }

    internal static AccountingVoucherLine Create(
        int lineNo, Guid accountId, string? description, decimal debitAmount, decimal creditAmount)
    {
        return new AccountingVoucherLine
        {
            Id = Guid.CreateVersion7(),
            LineNo = lineNo,
            AccountId = accountId,
            Description = description?.Trim(),
            DebitAmount = debitAmount,
            CreditAmount = creditAmount,
        };
    }

    /// <summary>Set by EF when added via <see cref="AccountingVoucher.AddLine"/>; needed for the FK.</summary>
    internal void AssignVoucher(Guid voucherId) => VoucherId = voucherId;

    /// <summary>Stamps this line with its parent voucher's <see cref="AccountingVoucher.BranchId"/>.</summary>
    internal void AssignBranch(Guid? branchId) => BranchId = branchId;
}
