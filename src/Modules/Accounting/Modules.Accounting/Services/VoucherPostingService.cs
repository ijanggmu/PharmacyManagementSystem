using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The cross-module implementation of <see cref="IVoucherPostingService"/> — registered for DI by
/// <c>AccountingModule</c>. Callers (Suppliers, Customers, and later Sales/Purchasing) only ever
/// see the Contracts interface; this type is never referenced outside this module. Accounting's own
/// owning flows (expense edit/delete) also use the members that are not on the interface
/// (<see cref="RepostSystemVoucherAsync"/>, <see cref="ReverseOwnedSystemVoucherAsync"/>).
/// </summary>
public sealed partial class VoucherPostingService(
    AccountingDbContext dbContext,
    IAccountingVoucherNumbers sequenceService,
    AccountingPostingLockService postingLockService,
    ICurrentBranch currentBranch,
    IBranchService branchService,
    ILogger<VoucherPostingService> logger)
    : IVoucherPostingService
{
    /// <summary>Half a paisa per line: the most rounding each 3-decimal line total can contribute when it is
    /// rounded to the stored 2 decimals.</summary>
    public const decimal RoundingResidualPerLine = 0.005m;

    /// <summary>The floor of the tolerance: one paisa, which also covers Sales' ±0.01 finalize tolerance.</summary>
    public const decimal MinRoundingResidual = 0.01m;

    /// <summary>
    /// The largest debit/credit difference, after rounding every line to 2 decimal places, that is absorbed by
    /// a "Rounding Off" line instead of rejecting the voucher: half a paisa per line, but at least one paisa.
    /// Anything larger is a real error and still fails.
    /// </summary>
    public static decimal MaxRoundingResidual(int lineCount) =>
        Math.Max(MinRoundingResidual, RoundingResidualPerLine * lineCount);

    public ValueTask<Guid> PostSystemVoucherAsync(PostVoucherRequest request, CancellationToken cancellationToken = default) =>
        PostCoreAsync(request, repostAfterReversal: false, cancellationToken);

    /// <summary>
    /// For an owning flow that has just reversed its own voucher and books a replacement under the same
    /// reference (an edited expense). Unlike <see cref="PostSystemVoucherAsync"/>, a reversed (Void) voucher
    /// for the reference does not count as "already posted"; a still-posted one does.
    /// </summary>
    public ValueTask<Guid> RepostSystemVoucherAsync(PostVoucherRequest request, CancellationToken cancellationToken = default) =>
        PostCoreAsync(request, repostAfterReversal: true, cancellationToken);

    private async ValueTask<Guid> PostCoreAsync(PostVoucherRequest request, bool repostAfterReversal, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // Idempotent posting: a redelivered event for the same (ReferenceType, ReferenceId) returns the
        // voucher already booked for it instead of failing or double-posting (root plan §6.1). That includes
        // a voucher that has since been reversed (Void): the source document was booked and then cancelled,
        // and a late redelivery of the original event must not book it a second time.
        var existing = await dbContext.Vouchers
            .AsNoTracking()
            .Where(v => v.ReferenceType == request.ReferenceType
                     && v.ReferenceId == request.ReferenceId
                     && v.Status != AccountingVoucherStatus.Draft)
            .Select(v => new { v.Id, v.Status, v.CreatedAtUtc })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var stillPosted = existing.FirstOrDefault(v => v.Status == AccountingVoucherStatus.Posted);
        if (stillPosted is not null)
        {
            return stillPosted.Id;
        }

        if (!repostAfterReversal && existing.Count > 0)
        {
            return existing.OrderByDescending(v => v.CreatedAtUtc).First().Id;
        }

        // A cancellation that was handled before this posting left a tombstone: book the voucher and reverse
        // it straight away, so the cancelled document is not left on the books.
        AccountingPendingReversal? pendingReversal = repostAfterReversal
            ? null
            : await dbContext.PendingReversals
                .FirstOrDefaultAsync(
                    p => p.ReferenceType == request.ReferenceType && p.ReferenceId == request.ReferenceId && p.ResolvedAtUtc == null,
                    cancellationToken)
                .ConfigureAwait(false);

        // The voucher carries the business date of the event (sale/receipt/payment date), not the time
        // the event was processed; a date in a locked period is booked in the open period instead.
        DateTime voucherDateUtc = await postingLockService
            .ResolveOpenDateAsync(request.VoucherDateUtc ?? DateTime.UtcNow, cancellationToken)
            .ConfigureAwait(false);
        await postingLockService.AssertPostingOpenAsync(voucherDateUtc, cancellationToken).ConfigureAwait(false);

        var (lines, newRoundingAccountId) = await BalanceLinesAsync(request, cancellationToken).ConfigureAwait(false);

        // A Rounding Off account created just now is not saved yet (it is saved with the voucher); it is a new,
        // active leaf, so only the other accounts need checking.
        await AccountingPostableAccounts
            .EnsurePostableAsync(
                dbContext,
                lines.Select(l => l.AccountId).Where(id => id != newRoundingAccountId),
                cancellationToken)
            .ConfigureAwait(false);

        // Branch attribution, most specific first: the branch the originating event carried, then the
        // caller's own branch (request context), then the tenant's default (main) branch. The last step
        // matters for the outbox dispatcher, which has no request context: without it those vouchers
        // were saved with no branch and silently dropped out of every per-branch report.
        Guid? branchId = request.BranchId
            ?? await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false)
            ?? await branchService.GetDefaultBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var voucher = AccountingVoucher.CreateDraft(
            voucherDateUtc, request.VoucherType, AccountingVoucherSource.System,
            request.Narration, request.ReferenceType, request.ReferenceId, branchId);

        foreach (var line in lines)
        {
            voucher.AddLine(line.AccountId, line.Description, line.DebitAmount, line.CreditAmount);
        }

        string series = VoucherSeries.ForVoucherType(voucher.VoucherType);
        int number = await sequenceService.ReserveNextNumberAsync(series, cancellationToken).ConfigureAwait(false);
        voucher.Post(VoucherSeries.Format(series, number), postedBy: "system");

        dbContext.Vouchers.Add(voucher);

        if (pendingReversal is not null)
        {
            DateTime reversalDate = await postingLockService
                .ResolveReversalDateAsync(pendingReversal.ReversalDateUtc, voucher.VoucherDateUtc, cancellationToken)
                .ConfigureAwait(false);
            int reversalNumber = await sequenceService.ReserveNextNumberAsync(VoucherSeries.Reversal, cancellationToken).ConfigureAwait(false);
            var reversal = voucher.CreateReversal(VoucherSeries.Format(VoucherSeries.Reversal, reversalNumber), "system", reversalDate, pendingReversal.Reason);
            dbContext.Vouchers.Add(reversal);
            pendingReversal.Resolve(reversal.Id);
            LogPendingReversalResolved(logger, request.ReferenceType, request.ReferenceId, voucher.VoucherNo, reversal.VoucherNo);
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException ex)
        {
            // Two concurrent callers raced past the pre-check above; the partial unique index
            // (ReferenceType, ReferenceId) WHERE Status = 'Posted' caught it at the DB layer.
            throw new CustomException(
                $"A voucher for {request.ReferenceType}/{request.ReferenceId} was posted concurrently. Retry to fetch it.",
                ex, HttpStatusCode.Conflict);
        }

        return voucher.Id;
    }

    /// <summary>
    /// Rounds every line to 2 decimal places (dropping lines that round to nothing) and, when the rounded
    /// debits and credits differ by no more than <see cref="MaxRoundingResidual"/> for that many lines, adds
    /// one "Rounding Off" line for the difference so the stored voucher balances exactly. Returns the id of a
    /// Rounding Off account that had to be created (unsaved) for it, if any.
    /// </summary>
    private async Task<(List<PostVoucherLine> Lines, Guid? NewRoundingAccountId)> BalanceLinesAsync(
        PostVoucherRequest request, CancellationToken cancellationToken)
    {
        var lines = (request.Lines ?? [])
            .Select(l => l with
            {
                DebitAmount = AccountingVoucher.RoundAmount(l.DebitAmount),
                CreditAmount = AccountingVoucher.RoundAmount(l.CreditAmount),
            })
            .Where(l => l.DebitAmount != 0m || l.CreditAmount != 0m)
            .ToList();

        if (lines.Count == 0)
        {
            throw new CustomException(
                "A voucher must have at least one line.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        decimal difference = lines.Sum(l => l.DebitAmount) - lines.Sum(l => l.CreditAmount);
        if (difference == 0m || Math.Abs(difference) > MaxRoundingResidual(lines.Count))
        {
            // Balanced already, or too far off to be rounding — AccountingVoucher.Post rejects the latter.
            return (lines, null);
        }

        var (roundingAccountId, created) = await GetOrCreateRoundingAccountAsync(cancellationToken).ConfigureAwait(false);
        LogRoundingLineAdded(logger, request.ReferenceType, request.ReferenceId, difference, lines.Count);
        lines.Add(difference > 0m
            ? new PostVoucherLine(roundingAccountId, "Rounding off", DebitAmount: 0m, CreditAmount: difference)
            : new PostVoucherLine(roundingAccountId, "Rounding off", DebitAmount: -difference, CreditAmount: 0m));
        return (lines, created ? roundingAccountId : null);
    }

    /// <summary>
    /// The system "Rounding Off" account (code <see cref="AccountingSystemAccountCodes.RoundingOff"/>), seeded by
    /// <c>AccountingDbInitializer</c>. For a tenant whose seed has not run since it was added, the account is
    /// created here but only added to the context — it is saved together with the voucher, so this never
    /// flushes the caller's other pending changes, and a concurrent creation surfaces as the voucher save's
    /// retryable conflict instead of a second query inside an aborted transaction.
    /// </summary>
    private async Task<(Guid Id, bool Created)> GetOrCreateRoundingAccountAsync(CancellationToken cancellationToken)
    {
        var tracked = dbContext.Accounts.Local
            .FirstOrDefault(a => a.Code == AccountingSystemAccountCodes.RoundingOff && a.IsSystem);
        if (tracked is not null)
        {
            bool unsaved = dbContext.Entry(tracked).State == EntityState.Added;
            return (tracked.Id, unsaved);
        }

        var existing = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Code == AccountingSystemAccountCodes.RoundingOff)
            .Select(a => new { a.Id, a.IsSystem })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (existing is { IsSystem: true })
        {
            return (existing.Id, false);
        }

        if (existing is not null)
        {
            throw new CustomException(
                $"Account code {AccountingSystemAccountCodes.RoundingOff} is used by a user-created account, so the system Rounding Off account can't be created. " +
                "Change that account's code, then retry.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        string expenseRootCode = AccountingAccount.RootHeads[AccountingAccountType.Expense].Code;
        var expenseRoot = await dbContext.Accounts
            .Where(a => a.ParentId == null && a.IsSystem && a.Code == expenseRootCode)
            .Select(a => (Guid?)a.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        var account = AccountingAccount.Create(
            AccountingSystemAccountCodes.RoundingOff, "Rounding Off", AccountingAccountType.Expense, isSystem: true, parentId: expenseRoot);
        dbContext.Accounts.Add(account);
        return (account.Id, true);
    }

    public async ValueTask VoidAsync(Guid voucherId, string reason, CancellationToken cancellationToken = default)
    {
        var voucher = await dbContext.Vouchers
            .Include(v => v.Lines)
            .FirstOrDefaultAsync(v => v.Id == voucherId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Voucher {voucherId} not found.");

        // An outright void erases the entry from every report as if it never happened, including from
        // the period it was dated in. System vouchers mirror a business document (sale, receipt,
        // payment) and must be reversed instead; and nothing dated in a closed period may change.
        if (voucher.Source == AccountingVoucherSource.System)
        {
            throw new CustomException(
                $"Voucher {voucher.VoucherNo} was posted by the system and can't be voided. Cancel the source document or reverse the voucher instead.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        // A reversed voucher is already Void but still counts in the ledger alongside its reversal (see
        // LedgerVoucherQueries); "voiding" it again would be meaningless, so say what happened instead.
        string? reversedBy = await dbContext.Vouchers
            .AsNoTracking()
            .Where(v => v.ReversesVoucherId == voucherId && v.Status != AccountingVoucherStatus.Draft)
            .Select(v => v.VoucherNo)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (reversedBy is not null)
        {
            throw new CustomException(
                $"Voucher {voucher.VoucherNo} was reversed by {reversedBy} and can't be voided. To book it again, reverse {reversedBy}.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        await postingLockService.AssertPostingOpenAsync(voucher.VoucherDateUtc, cancellationToken).ConfigureAwait(false);

        // Refuses a reversing voucher (see AccountingVoucher.VoidVoucher).
        voucher.VoidVoucher(reason);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<Guid> ReverseAsync(
        Guid voucherId, string reversedBy, DateTime? reversalDateUtc = null, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reversedBy);

        var voucher = await dbContext.Vouchers
            .Include(v => v.Lines)
            .FirstOrDefaultAsync(v => v.Id == voucherId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Voucher {voucherId} not found.");

        // A system voucher mirrors a business document (sale, receipt, payment, expense). Reversing it by hand
        // would leave the document standing with no GL entry behind it, and the owning flow (cancelling the
        // sale, voiding the receipt, editing the expense) could then reverse it a second time.
        if (voucher.Source == AccountingVoucherSource.System)
        {
            throw new CustomException(
                $"Voucher {voucher.VoucherNo} was posted by the system for a business document. Cancel, void or edit that document instead; it reverses its own voucher.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (await IsReversedAsync(voucherId, cancellationToken).ConfigureAwait(false))
        {
            throw new CustomException(
                "This voucher was already reversed.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        // A reversal can't be dated before the entry it reverses: that would take the amount out of a period
        // in which it was never booked. The same Nepal day is fine (kept at or after the original instant).
        DateTime reversalDate = reversalDateUtc ?? DateTime.UtcNow;
        if (NepalDate.FromUtc(reversalDate) < NepalDate.FromUtc(voucher.VoucherDateUtc))
        {
            throw new CustomException(
                $"The reversal date can't be before the voucher's own date ({NepalDate.FromUtc(voucher.VoucherDateUtc):yyyy-MM-dd}).",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (reversalDate < voucher.VoucherDateUtc)
        {
            reversalDate = voucher.VoucherDateUtc;
        }

        await postingLockService.AssertPostingOpenAsync(reversalDate, cancellationToken).ConfigureAwait(false);

        return await AddReversalAsync(voucher, reversedBy, reversalDate, reason: null, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Reverses a system voucher on behalf of the Accounting flow that owns it (an expense being edited or
    /// deleted). Dated at <paramref name="requestedDateUtc"/> — never before the original — and moved to the
    /// open period when that falls in a locked one, so a closed period keeps reporting what was filed.
    /// </summary>
    public async ValueTask<Guid> ReverseOwnedSystemVoucherAsync(
        Guid voucherId, string reversedBy, DateTime requestedDateUtc, string? reason = null, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reversedBy);

        var voucher = await dbContext.Vouchers
            .Include(v => v.Lines)
            .FirstOrDefaultAsync(v => v.Id == voucherId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Voucher {voucherId} not found.");

        if (await IsReversedAsync(voucherId, cancellationToken).ConfigureAwait(false))
        {
            throw new CustomException(
                "This voucher was already reversed.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        DateTime reversalDate = await postingLockService
            .ResolveReversalDateAsync(requestedDateUtc, voucher.VoucherDateUtc, cancellationToken)
            .ConfigureAwait(false);

        return await AddReversalAsync(voucher, reversedBy, reversalDate, reason, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<Guid?> ReverseSystemVoucherAsync(
        string referenceType,
        Guid referenceId,
        string reason,
        DateTime? reversalDateUtc = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(referenceType);

        var voucher = await dbContext.Vouchers
            .Include(v => v.Lines)
            .FirstOrDefaultAsync(
                v => v.ReferenceType == referenceType && v.ReferenceId == referenceId && v.Status == AccountingVoucherStatus.Posted,
                cancellationToken)
            .ConfigureAwait(false);

        if (voucher is null)
        {
            await RecordPendingReversalAsync(referenceType, referenceId, reason, reversalDateUtc ?? DateTime.UtcNow, cancellationToken)
                .ConfigureAwait(false);
            return null;
        }

        if (await IsReversedAsync(voucher.Id, cancellationToken).ConfigureAwait(false))
        {
            return null; // Already reversed — a redelivery is a no-op.
        }

        // Dated at the cancellation (never before the original), and moved to the open period when that
        // date is in a locked one, so a closed period keeps reporting what was filed.
        DateTime reversalDate = await postingLockService
            .ResolveReversalDateAsync(reversalDateUtc ?? DateTime.UtcNow, voucher.VoucherDateUtc, cancellationToken)
            .ConfigureAwait(false);

        return await AddReversalAsync(voucher, "system", reversalDate, reason, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// No posted voucher to reverse. If the reference was booked and has since been reversed (a Void voucher),
    /// this is a redelivery: nothing to do. Otherwise the original posting has not been handled yet (the
    /// events arrived out of order), so a tombstone is recorded for <see cref="PostSystemVoucherAsync"/> to
    /// honour when it does arrive.
    /// </summary>
    private async Task RecordPendingReversalAsync(
        string referenceType, Guid referenceId, string reason, DateTime reversalDateUtc, CancellationToken cancellationToken)
    {
        bool everBooked = await dbContext.Vouchers
            .AsNoTracking()
            .AnyAsync(
                v => v.ReferenceType == referenceType && v.ReferenceId == referenceId && v.Status != AccountingVoucherStatus.Draft,
                cancellationToken)
            .ConfigureAwait(false);
        bool alreadyPending = await dbContext.PendingReversals
            .AsNoTracking()
            .AnyAsync(p => p.ReferenceType == referenceType && p.ReferenceId == referenceId, cancellationToken)
            .ConfigureAwait(false);
        if (everBooked || alreadyPending)
        {
            return;
        }

        dbContext.PendingReversals.Add(AccountingPendingReversal.Create(referenceType, referenceId, reason, reversalDateUtc));
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException ex)
        {
            // A concurrent delivery recorded the same tombstone (unique per reference). Retrying finds it.
            throw new CustomException(
                $"A pending reversal for {referenceType}/{referenceId} was recorded concurrently. Retry.",
                ex, HttpStatusCode.Conflict);
        }

        LogPendingReversalRecorded(logger, referenceType, referenceId);
    }

    private async Task<Guid> AddReversalAsync(
        AccountingVoucher voucher, string reversedBy, DateTime reversalDate, string? reason, CancellationToken cancellationToken)
    {
        int number = await sequenceService.ReserveNextNumberAsync(VoucherSeries.Reversal, cancellationToken).ConfigureAwait(false);
        var reversal = voucher.CreateReversal(VoucherSeries.Format(VoucherSeries.Reversal, number), reversedBy, reversalDate, reason);

        dbContext.Vouchers.Add(reversal);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return reversal.Id;
    }

    public async ValueTask<Guid?> FindPostedVoucherIdAsync(string referenceType, Guid referenceId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(referenceType);

        return await dbContext.Vouchers
            .AsNoTracking()
            .Where(v => v.ReferenceType == referenceType && v.ReferenceId == referenceId && v.Status == AccountingVoucherStatus.Posted)
            .Select(v => (Guid?)v.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
    }

    private Task<bool> IsReversedAsync(Guid voucherId, CancellationToken cancellationToken) =>
        dbContext.Vouchers
            .AsNoTracking()
            .AnyAsync(v => v.ReversesVoucherId == voucherId && v.Status == AccountingVoucherStatus.Posted, cancellationToken);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "[Accounting] voucher {ReferenceType}/{ReferenceId}: added a Rounding Off line of {Difference} to balance {LineCount} rounded lines")]
    private static partial void LogRoundingLineAdded(ILogger logger, string referenceType, Guid referenceId, decimal difference, int lineCount);

    [LoggerMessage(Level = LogLevel.Information,
        Message = "[Accounting] {ReferenceType}/{ReferenceId} was reversed before its voucher was posted; recorded a pending reversal")]
    private static partial void LogPendingReversalRecorded(ILogger logger, string referenceType, Guid referenceId);

    [LoggerMessage(Level = LogLevel.Information,
        Message = "[Accounting] {ReferenceType}/{ReferenceId} had a pending reversal: posted {VoucherNo} and reversed it with {ReversalNo}")]
    private static partial void LogPendingReversalResolved(ILogger logger, string referenceType, Guid referenceId, string voucherNo, string reversalNo);
}
