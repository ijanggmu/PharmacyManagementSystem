using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The cross-module implementation of <see cref="IVoucherPostingService"/> — registered for DI by
/// <c>AccountingModule</c>. Callers (Suppliers, Customers, and later Sales/Purchasing) only ever
/// see the Contracts interface; this type is never referenced outside this module.
/// </summary>
public sealed class VoucherPostingService(
    AccountingDbContext dbContext,
    IAccountingVoucherNumbers sequenceService,
    AccountingPostingLockService postingLockService,
    ICurrentBranch currentBranch,
    IBranchService branchService)
    : IVoucherPostingService
{
    /// <summary>
    /// The largest debit/credit difference, after rounding every line to 2 decimal places, that is
    /// absorbed by a "Rounding Off" line instead of rejecting the voucher. It covers Sales' ±0.01
    /// finalize tolerance plus half a paisa of rounding on each of a handful of 3-decimal line totals;
    /// anything larger is a real error and still fails.
    /// </summary>
    public const decimal MaxRoundingResidual = 0.05m;

    public async ValueTask<Guid> PostSystemVoucherAsync(PostVoucherRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        // Idempotent posting: a retried call for the same (ReferenceType, ReferenceId) returns the
        // already-posted voucher instead of failing or double-posting (root plan §6.1).
        var existing = await dbContext.Vouchers
            .AsNoTracking()
            .Where(v => v.ReferenceType == request.ReferenceType
                     && v.ReferenceId == request.ReferenceId
                     && v.Status == AccountingVoucherStatus.Posted)
            .Select(v => (Guid?)v.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (existing is { } existingId)
        {
            return existingId;
        }

        // The voucher carries the business date of the event (sale/receipt/payment date), not the time
        // the event was processed; a date in a locked period is booked on the first open day instead.
        DateTime voucherDateUtc = await postingLockService
            .ResolveOpenDateAsync(request.VoucherDateUtc ?? DateTime.UtcNow, cancellationToken)
            .ConfigureAwait(false);
        await postingLockService.AssertPostingOpenAsync(voucherDateUtc, cancellationToken).ConfigureAwait(false);

        var lines = await BalanceLinesAsync(request.Lines, cancellationToken).ConfigureAwait(false);

        await AccountingPostableAccounts
            .EnsurePostableAsync(dbContext, lines.Select(l => l.AccountId), cancellationToken)
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

        int number = await sequenceService.ReserveNextNumberAsync(cancellationToken).ConfigureAwait(false);
        voucher.Post($"SV-{number:D6}", postedBy: "system");

        dbContext.Vouchers.Add(voucher);

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
    /// debits and credits differ by no more than <see cref="MaxRoundingResidual"/>, adds one "Rounding Off"
    /// line for the difference so the stored voucher balances exactly.
    /// </summary>
    private async Task<List<PostVoucherLine>> BalanceLinesAsync(
        IReadOnlyList<PostVoucherLine>? requested, CancellationToken cancellationToken)
    {
        var lines = (requested ?? [])
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
        if (difference == 0m || Math.Abs(difference) > MaxRoundingResidual)
        {
            // Balanced already, or too far off to be rounding — AccountingVoucher.Post rejects the latter.
            return lines;
        }

        Guid roundingAccountId = await GetOrCreateRoundingAccountAsync(cancellationToken).ConfigureAwait(false);
        lines.Add(difference > 0m
            ? new PostVoucherLine(roundingAccountId, "Rounding off", DebitAmount: 0m, CreditAmount: difference)
            : new PostVoucherLine(roundingAccountId, "Rounding off", DebitAmount: -difference, CreditAmount: 0m));
        return lines;
    }

    /// <summary>The "Rounding Off" account, created on first use for tenants seeded before it existed
    /// (the DbMigrator seed adds it too, but a sale must not fail because the seed has not run yet).</summary>
    private async Task<Guid> GetOrCreateRoundingAccountAsync(CancellationToken cancellationToken)
    {
        var existing = await dbContext.Accounts
            .Where(a => a.Code == AccountingSystemAccountCodes.RoundingOff)
            .Select(a => (Guid?)a.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (existing is { } id)
        {
            return id;
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
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return account.Id;
        }
        catch (DbUpdateException)
        {
            // Another posting created it concurrently (unique code index) — use that one.
            dbContext.Entry(account).State = EntityState.Detached;
            return await dbContext.Accounts
                .Where(a => a.Code == AccountingSystemAccountCodes.RoundingOff)
                .Select(a => a.Id)
                .FirstAsync(cancellationToken)
                .ConfigureAwait(false);
        }
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

        await postingLockService.AssertPostingOpenAsync(voucher.VoucherDateUtc, cancellationToken).ConfigureAwait(false);

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

        if (await IsReversedAsync(voucherId, cancellationToken).ConfigureAwait(false))
        {
            throw new CustomException(
                "This voucher was already reversed.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var reversalDate = reversalDateUtc ?? DateTime.UtcNow;
        await postingLockService.AssertPostingOpenAsync(reversalDate, cancellationToken).ConfigureAwait(false);

        int number = await sequenceService.ReserveNextNumberAsync(cancellationToken).ConfigureAwait(false);
        var reversal = voucher.CreateReversal($"RV-{number:D6}", reversedBy, reversalDate);

        dbContext.Vouchers.Add(reversal);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return reversal.Id;
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
        if (voucher is null || await IsReversedAsync(voucher.Id, cancellationToken).ConfigureAwait(false))
        {
            return null; // Never posted (the event raced ahead) or already reversed — a redelivery is a no-op.
        }

        // Dated at the cancellation (never before the original), and moved to the first open day when
        // that date is in a locked period, so a closed period keeps reporting what was filed.
        DateTime requested = reversalDateUtc ?? DateTime.UtcNow;
        if (requested < voucher.VoucherDateUtc)
        {
            requested = voucher.VoucherDateUtc;
        }

        DateTime reversalDate = await postingLockService.ResolveOpenDateAsync(requested, cancellationToken).ConfigureAwait(false);

        int number = await sequenceService.ReserveNextNumberAsync(cancellationToken).ConfigureAwait(false);
        var reversal = voucher.CreateReversal($"RV-{number:D6}", "system", reversalDate, reason);

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
}
