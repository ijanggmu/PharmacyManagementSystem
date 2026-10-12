namespace FSH.Modules.Accounting.Contracts.Services;

/// <summary>
/// One line of a system-originated voucher. The CALLING module owns account mapping
/// (its own <c>ICoaMapper</c>-equivalent) — Accounting only validates and posts
/// (pharmacy-modules-plan.md §4.3).
/// </summary>
public sealed record PostVoucherLine(Guid AccountId, string? Description, decimal DebitAmount, decimal CreditAmount);

/// <summary>
/// Request to post a system voucher. <paramref name="ReferenceType"/>/<paramref name="ReferenceId"/>
/// together with the DB-level partial unique index on posted vouchers enforce "one posted voucher
/// per reference" — the idempotency guarantee callers rely on when retrying.
///
/// <para>
/// <paramref name="BranchId"/> is the branch to stamp on the posted voucher, when the caller already
/// knows it (ideally the originating cross-module integration event's own BranchId, e.g. a future
/// <c>SaleCompletedIntegrationEvent.BranchId</c> — see docs/branch-scoping-plan.md wave-2 notes).
/// When <c>null</c>, <c>VoucherPostingService</c> falls back to
/// <c>ICurrentBranch.GetBranchIdAsync()</c>, which is unreliable for events processed by a
/// background/outbox dispatcher with no ambient request/branch context.
/// </para>
/// <para>
/// <paramref name="VoucherDateUtc"/> is the BUSINESS date of the entry (the sale/receipt/payment date the
/// originating event carries), not the time the event happened to be processed. When <c>null</c> the
/// voucher is dated now. A date that falls in a locked accounting period is moved to the first open
/// day (see <c>AccountingPostingLockService.ResolveOpenDateAsync</c>), so a back-dated event never
/// dead-letters.
/// </para>
/// <para>
/// Lines are rounded to 2 decimal places (the stored precision). A residual of at most
/// <c>VoucherPostingService.MaxRoundingResidual</c> (half a paisa per line, at least one paisa) between the
/// rounded debits and credits is posted to the "Rounding Off" account (<see cref="AccountingSystemAccountCodes.RoundingOff"/>); anything larger is
/// rejected as unbalanced.
/// </para>
/// </summary>
public sealed record PostVoucherRequest(
    string VoucherType,
    string ReferenceType,
    Guid ReferenceId,
    string? Narration,
    IReadOnlyList<PostVoucherLine> Lines,
    Guid? BranchId = null,
    DateTime? VoucherDateUtc = null);

/// <summary>
/// The synchronous, in-process cross-module surface other modules call to post/void GL entries —
/// NOT a Mediator command, so it can participate in the caller's own ambient database transaction
/// (see SPIKE-0 / eventing.md "Atomicity"). Implemented by <c>Modules.Accounting</c>'s
/// <c>VoucherPostingService</c> and registered for DI by <c>AccountingModule</c>; a caller only
/// needs a reference to this Contracts project, never the Accounting runtime project.
/// </summary>
public interface IVoucherPostingService
{
    /// <summary>
    /// Validates the lines balance (Σdebits == Σcredits), assigns the next voucher number, and
    /// posts — all inside whatever transaction is ambient on the caller's DbContext connection.
    /// Idempotent: if a voucher was already booked for this (ReferenceType, ReferenceId) — still posted,
    /// or since reversed — its id is returned and nothing new is posted. If the reference was reversed
    /// before it was posted (see <see cref="ReverseSystemVoucherAsync"/>), the voucher is posted and
    /// immediately reversed.
    /// </summary>
    ValueTask<Guid> PostSystemVoucherAsync(PostVoucherRequest request, CancellationToken cancellationToken = default);

    /// <summary>Voids a posted MANUAL voucher outright. Draft/already-void vouchers are rejected, and so
    /// are system vouchers (they must be reversed — see <see cref="ReverseSystemVoucherAsync"/>) and
    /// vouchers dated in a locked period.</summary>
    ValueTask VoidAsync(Guid voucherId, string reason, CancellationToken cancellationToken = default);

    /// <summary>
    /// The system-flow counterpart of a void: finds the posted voucher for
    /// (<paramref name="referenceType"/>, <paramref name="referenceId"/>) and reverses it with a new
    /// voucher dated <paramref name="reversalDateUtc"/> (the cancellation/void date; now when null). If
    /// that date is in a locked period the reversal is dated in the first open day instead, so the closed
    /// period's figures never change. Idempotent: returns <c>null</c> when there is no posted voucher to
    /// reverse (already reversed, or never posted). When it was never posted — the events arrived out of order —
    /// a "reversed before posted" marker is recorded so that the later <see cref="PostSystemVoucherAsync"/>
    /// books the voucher and reverses it at once. Returns the reversing voucher's id otherwise.
    /// </summary>
    ValueTask<Guid?> ReverseSystemVoucherAsync(
        string referenceType,
        Guid referenceId,
        string reason,
        DateTime? reversalDateUtc = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Reverses a posted MANUAL voucher: posts a brand-new voucher with every line's debit/credit
    /// swapped, and flips the original to Void — the original is never edited or deleted (rule.md
    /// §9.1). Rejects a system voucher (the flow that owns it — cancelling the sale, voiding the
    /// receipt — reverses it), a voucher that is not posted, one already reversed, a reversal date
    /// before the voucher's own date, or one that falls on/before the tenant's posting-lock date. Returns the new (reversing) voucher's id.
    /// </summary>
    ValueTask<Guid> ReverseAsync(
        Guid voucherId, string reversedBy, DateTime? reversalDateUtc = null, CancellationToken cancellationToken = default);

    /// <summary>Finds the posted voucher for a (ReferenceType, ReferenceId) pair, if any — lets a
    /// caller void the voucher it posted earlier (e.g. Sales cancelling a sale) without having to
    /// remember the voucher's own id.</summary>
    ValueTask<Guid?> FindPostedVoucherIdAsync(string referenceType, Guid referenceId, CancellationToken cancellationToken = default);
}
