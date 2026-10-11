using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Ledger;

/// <summary>Sum of every customer's <c>CurrentBalance</c> — what Accounting's `ar-gl-reconciliation`
/// report compares against the Accounts Receivable GL account.
/// <para>With <paramref name="BranchId"/> set, the total is instead the net (debits less credits) of
/// that branch's <c>CustomerLedgerEntry</c> rows — <c>Customer.CurrentBalance</c> is tenant-wide.
/// Legacy ledger rows with a null <c>BranchId</c> belong to no branch and are excluded from every
/// per-branch total (they are still in the all-branches total). The value is passed through as-is:
/// the caller is responsible for resolving/authorizing the branch.</para></summary>
/// <remarks><paramref name="AsOfUtc"/>: when set, the total of ledger entries dated on or before it (the
/// balance as at that moment) instead of the current balance.</remarks>
public sealed record GetTotalArBalanceQuery(Guid? BranchId = null, DateTime? AsOfUtc = null) : IQuery<decimal>;
