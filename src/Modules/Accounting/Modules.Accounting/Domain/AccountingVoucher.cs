using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Accounting.Domain;

public enum AccountingVoucherSource
{
    Manual = 0,
    System = 1,
}

public enum AccountingVoucherStatus
{
    Draft = 0,
    Posted = 1,
    Void = 2,
}

/// <summary>
/// Double-entry journal voucher. The balanced-debits-equal-credits invariant is enforced here, in
/// <see cref="Post"/>, before <see cref="Status"/> ever flips to <see cref="AccountingVoucherStatus.Posted"/>,
/// and <see cref="CreateReversal"/> builds its lines by swapping an already balanced voucher's. This is
/// the only enforcement point: there is no database constraint or trigger backing it (a per-voucher
/// Σ debit = Σ credit check spans rows, which a Postgres CHECK can't express), so every path that writes
/// lines must go through this aggregate. Once posted, a voucher is immutable: no line can be
/// added/changed, only reversed or voided.
/// </summary>
public sealed class AccountingVoucher : AggregateRoot<Guid>
{
    private readonly List<AccountingVoucherLine> _lines = [];

    public string VoucherNo { get; private set; } = default!;
    public DateTime VoucherDateUtc { get; private set; }

    /// <summary>Open-ended by design: "journal", "system_sale", "system_purchase", etc. — new
    /// system flows shouldn't require an Accounting-module code change to introduce a type.</summary>
    public string VoucherType { get; private set; } = default!;
    public AccountingVoucherSource Source { get; private set; }
    public string? ReferenceType { get; private set; }
    public Guid? ReferenceId { get; private set; }
    public AccountingVoucherStatus Status { get; private set; } = AccountingVoucherStatus.Draft;
    public string? Narration { get; private set; }

    /// <summary>Nullable — "NULL = legacy/tenant-wide" per docs/branch-scoping-plan.md §2. Sourced via
    /// <c>ICurrentBranch.GetBranchIdAsync()</c> for manually-created vouchers, or ideally stamped from
    /// the originating cross-module integration event's own BranchId for system-posted vouchers (see
    /// <c>VoucherPostingService.PostSystemVoucherAsync</c>/<c>PostVoucherRequest.BranchId</c>).</summary>
    public Guid? BranchId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? PostedAtUtc { get; private set; }
    public string? PostedBy { get; private set; }
    public DateTime? VoidedAtUtc { get; private set; }
    public string? VoidReason { get; private set; }

    /// <summary>Set on the reversing voucher only — points back at the voucher it reverses.
    /// Combined with a caller-side "no posted voucher already reverses this one" check, this
    /// keeps reversal a one-shot operation per posted voucher.</summary>
    public Guid? ReversesVoucherId { get; private set; }

    public IReadOnlyList<AccountingVoucherLine> Lines => _lines;

    private AccountingVoucher() { }

    public static AccountingVoucher CreateDraft(
        DateTime voucherDateUtc,
        string voucherType,
        AccountingVoucherSource source,
        string? narration,
        string? referenceType = null,
        Guid? referenceId = null,
        Guid? branchId = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(voucherType);

        return new AccountingVoucher
        {
            Id = Guid.CreateVersion7(),
            VoucherNo = "DRAFT", // real number assigned atomically at Post() time
            VoucherDateUtc = voucherDateUtc,
            VoucherType = voucherType.Trim(),
            Source = source,
            ReferenceType = referenceType,
            ReferenceId = referenceId,
            Narration = narration?.Trim(),
            Status = AccountingVoucherStatus.Draft,
            CreatedAtUtc = DateTime.UtcNow,
            BranchId = branchId,
        };
    }

    public void AddLine(Guid accountId, string? description, decimal debitAmount, decimal creditAmount)
    {
        EnsureDraft();

        if (debitAmount < 0 || creditAmount < 0)
        {
            throw new CustomException(
                "Voucher line amounts cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if ((debitAmount > 0) == (creditAmount > 0))
        {
            throw new CustomException(
                "Each voucher line must have exactly one of debit or credit greater than zero.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        var line = AccountingVoucherLine.Create(_lines.Count + 1, accountId, description, debitAmount, creditAmount);
        line.AssignVoucher(Id);
        line.AssignBranch(BranchId);
        _lines.Add(line);
    }

    /// <summary>
    /// Balances and posts. <paramref name="assignedVoucherNo"/> comes from the atomic tenant
    /// sequence (<c>AccountingVoucherSequenceService</c>) — generating it here would race under
    /// concurrent posts, per root plan §5's "posting-lock ordering" note.
    /// </summary>
    public void Post(string assignedVoucherNo, string postedBy)
    {
        EnsureDraft();
        ArgumentException.ThrowIfNullOrWhiteSpace(assignedVoucherNo);
        ArgumentException.ThrowIfNullOrWhiteSpace(postedBy);

        if (_lines.Count == 0)
        {
            throw new CustomException(
                "A voucher must have at least one line before it can be posted.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        // Lines are stored as numeric(18,2). Round first and balance the ROUNDED amounts: comparing the
        // raw values let a voucher of 3.125 + 3.125 against 6.25 pass here and then persist as
        // 3.13 + 3.13 against 6.25 — an unbalanced ledger.
        foreach (var line in _lines)
        {
            line.RoundToCents();
            if (line.DebitAmount == 0m && line.CreditAmount == 0m)
            {
                throw new CustomException(
                    "A voucher line rounds to zero; amounts must be at least 0.01.",
                    (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }
        }

        decimal totalDebit = _lines.Sum(l => l.DebitAmount);
        decimal totalCredit = _lines.Sum(l => l.CreditAmount);
        if (totalDebit != totalCredit)
        {
            throw new CustomException(
                $"Voucher is not balanced: total debit {totalDebit} != total credit {totalCredit}.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        VoucherNo = assignedVoucherNo;
        Status = AccountingVoucherStatus.Posted;
        PostedAtUtc = DateTime.UtcNow;
        PostedBy = postedBy;
    }

    /// <summary>Rounds a money amount to the 2 decimal places voucher lines are stored with.</summary>
    public static decimal RoundAmount(decimal amount) => Math.Round(amount, 2, MidpointRounding.AwayFromZero);

    /// <summary>
    /// Produces a new, already-posted voucher with every line's debit/credit swapped (a true
    /// offsetting entry — rule.md §9.1 "void/reverse with trace": the original is never edited or
    /// deleted, only voided, and the reversal is a fully traceable second voucher), and flips this
    /// voucher to <see cref="AccountingVoucherStatus.Void"/>. Only a <see cref="AccountingVoucherStatus.Posted"/>
    /// voucher can be reversed — the caller is responsible for checking it hasn't already been
    /// reversed (a query across vouchers, so it can't live here) and for the posting-lock check.
    /// </summary>
    public AccountingVoucher CreateReversal(string assignedVoucherNo, string reversedBy, DateTime reversalDateUtc, string? reason = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(assignedVoucherNo);
        ArgumentException.ThrowIfNullOrWhiteSpace(reversedBy);

        if (Status != AccountingVoucherStatus.Posted)
        {
            throw new CustomException(
                $"Only a posted voucher can be reversed (current status: {Status}).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var reversal = new AccountingVoucher
        {
            Id = Guid.CreateVersion7(),
            VoucherNo = assignedVoucherNo,
            VoucherDateUtc = reversalDateUtc,
            VoucherType = "journal",
            // A reversal keeps its original's source: the reversal of a system voucher (a cancelled sale,
            // a voided receipt) is itself system-owned, so it can't be voided outright from the UI
            // (which would silently re-book the original).
            Source = Source,
            ReferenceType = "reversal",
            ReferenceId = Id,
            ReversesVoucherId = Id,
            Narration = string.IsNullOrWhiteSpace(reason) ? $"Reversal of {VoucherNo}" : $"Reversal of {VoucherNo}: {reason.Trim()}",
            Status = AccountingVoucherStatus.Posted,
            CreatedAtUtc = DateTime.UtcNow,
            PostedAtUtc = DateTime.UtcNow,
            PostedBy = reversedBy,
            BranchId = BranchId,
        };

        int lineNo = 0;
        foreach (var line in _lines)
        {
            lineNo++;
            var reversedLine = AccountingVoucherLine.Create(
                lineNo, line.AccountId, $"Reversal: {line.Description}", line.CreditAmount, line.DebitAmount);
            reversedLine.AssignVoucher(reversal.Id);
            reversedLine.AssignBranch(reversal.BranchId);
            reversal._lines.Add(reversedLine);
        }

        Status = AccountingVoucherStatus.Void;
        VoidedAtUtc = DateTime.UtcNow;
        VoidReason = $"Reversed by {assignedVoucherNo}";

        return reversal;
    }

    /// <summary>
    /// Voids a posted voucher outright (it drops out of the ledger). A reversing voucher can't be voided:
    /// its original stays <see cref="AccountingVoucherStatus.Void"/> ("reversed") yet would be back on the
    /// books with no visible entry undoing the reversal, and could never be reversed again. Reverse the
    /// reversal instead — that re-books the original with a trace.
    /// </summary>
    public void VoidVoucher(string reason)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);

        if (ReversesVoucherId is not null)
        {
            throw new CustomException(
                $"Voucher {VoucherNo} reverses another voucher and can't be voided. Reverse it instead to put the original back on the books.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (Status != AccountingVoucherStatus.Posted)
        {
            throw new CustomException(
                $"Only a posted voucher can be voided (current status: {Status}).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Status = AccountingVoucherStatus.Void;
        VoidedAtUtc = DateTime.UtcNow;
        VoidReason = reason.Trim();
    }

    /// <summary>Updates the editable header fields of a draft voucher. Only a <see cref="AccountingVoucherStatus.Draft"/>
    /// voucher can be edited — once posted it is immutable (see class remarks); the caller should
    /// follow with <see cref="ClearLines"/> + <see cref="AddLine"/> to replace the lines.</summary>
    public void UpdateDraft(DateTime voucherDateUtc, string? narration)
    {
        EnsureDraft();

        VoucherDateUtc = voucherDateUtc;
        Narration = narration?.Trim();
    }

    /// <summary>Removes every line from a draft voucher so the caller can re-add the updated set via
    /// <see cref="AddLine"/>. EF Core deletes the orphaned line rows on save, since the FK is required.</summary>
    public void ClearLines()
    {
        EnsureDraft();
        _lines.Clear();
    }

    /// <summary>Throws unless the voucher is still a draft. Used both internally (<see cref="AddLine"/>,
    /// <see cref="UpdateDraft"/>, <see cref="ClearLines"/>) and by the delete handler, which has no other
    /// reason to mutate the entity before removing it.</summary>
    internal void EnsureDraft()
    {
        if (Status != AccountingVoucherStatus.Draft)
        {
            throw new CustomException(
                $"Voucher is {Status} and can no longer be modified.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
