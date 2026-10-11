using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Ledger;

/// <summary>Sum of every supplier's <c>CurrentBalance</c> — what Accounting's `ap-gl-reconciliation`
/// report compares against the Accounts Payable GL account.
/// <para>With <paramref name="BranchId"/> set, the total is instead the net of that branch's
/// <c>SupplierLedgerEntry</c> rows, using the same sign convention as <c>Supplier.CurrentBalance</c>
/// (debits less credits). <c>Supplier.CurrentBalance</c> itself is tenant-wide. Legacy ledger rows
/// with a null <c>BranchId</c> belong to no branch and are excluded from every per-branch total (they
/// are still in the all-branches total). The value is passed through as-is: the caller is
/// responsible for resolving/authorizing the branch.</para></summary>
public sealed record GetTotalApBalanceQuery(Guid? BranchId = null) : IQuery<decimal>;
