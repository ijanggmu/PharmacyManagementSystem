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
/// </summary>
public sealed record PostVoucherRequest(
    string VoucherType,
    string ReferenceType,
    Guid ReferenceId,
    string? Narration,
    IReadOnlyList<PostVoucherLine> Lines,
    Guid? BranchId = null);

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
    /// Throws if a voucher already exists for this (ReferenceType, ReferenceId).
    /// </summary>
    ValueTask<Guid> PostSystemVoucherAsync(PostVoucherRequest request, CancellationToken cancellationToken = default);

    /// <summary>Voids a posted voucher. Draft/already-void vouchers are rejected. A voucher dated in a closed
    /// (posting-locked) period is reversed instead — a reversing voucher dated today — so the closed period's
    /// figures never change.</summary>
    ValueTask VoidAsync(Guid voucherId, string reason, CancellationToken cancellationToken = default);

    /// <summary>
    /// Reverses a posted voucher: posts a brand-new voucher with every line's debit/credit
    /// swapped, and flips the original to Void — the original is never edited or deleted (rule.md
    /// §9.1). Rejects a voucher that is not posted, one already reversed, or a reversal date that
    /// falls on/before the tenant's posting-lock date. Returns the new (reversing) voucher's id.
    /// </summary>
    ValueTask<Guid> ReverseAsync(
        Guid voucherId, string reversedBy, DateTime? reversalDateUtc = null, CancellationToken cancellationToken = default);

    /// <summary>Finds the posted voucher for a (ReferenceType, ReferenceId) pair, if any — lets a
    /// caller void the voucher it posted earlier (e.g. Sales cancelling a sale) without having to
    /// remember the voucher's own id.</summary>
    ValueTask<Guid?> FindPostedVoucherIdAsync(string referenceType, Guid referenceId, CancellationToken cancellationToken = default);
}
