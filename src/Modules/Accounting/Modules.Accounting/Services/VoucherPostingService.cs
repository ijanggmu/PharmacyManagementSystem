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
    AccountingVoucherSequenceService sequenceService,
    AccountingPostingLockService postingLockService,
    ICurrentBranch currentBranch,
    IBranchService branchService)
    : IVoucherPostingService
{
    public async ValueTask<Guid> PostSystemVoucherAsync(PostVoucherRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        await postingLockService.AssertPostingOpenAsync(DateTime.UtcNow, cancellationToken).ConfigureAwait(false);

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

        if (request.Lines.Count == 0)
        {
            throw new CustomException(
                "A voucher must have at least one line.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        await AccountingPostableAccounts
            .EnsurePostableAsync(dbContext, request.Lines.Select(l => l.AccountId), cancellationToken)
            .ConfigureAwait(false);

        // Branch attribution, most specific first: the branch the originating event carried, then the
        // caller's own branch (request context), then the tenant's default (main) branch. The last step
        // matters for the outbox dispatcher, which has no request context: without it those vouchers
        // were saved with no branch and silently dropped out of every per-branch report.
        Guid? branchId = request.BranchId
            ?? await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false)
            ?? await branchService.GetDefaultBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var voucher = AccountingVoucher.CreateDraft(
            DateTime.UtcNow, request.VoucherType, AccountingVoucherSource.System,
            request.Narration, request.ReferenceType, request.ReferenceId, branchId);

        foreach (var line in request.Lines)
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

    public async ValueTask VoidAsync(Guid voucherId, string reason, CancellationToken cancellationToken = default)
    {
        var voucher = await dbContext.Vouchers
            .Include(v => v.Lines)
            .FirstOrDefaultAsync(v => v.Id == voucherId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Voucher {voucherId} not found.");

        // A voucher in a closed period is never voided outright: that would take it out of a month whose
        // reports (P&L, VAT return) are already final. It is reversed instead, with the reversal dated today,
        // so the closed month stays as filed and the correction lands in the open period.
        if (await postingLockService.IsLockedAsync(voucher.VoucherDateUtc, cancellationToken).ConfigureAwait(false))
        {
            await ReverseAsync(voucherId, reversedBy: "system", reversalDateUtc: null, cancellationToken).ConfigureAwait(false);
            return;
        }

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

        bool alreadyReversed = await dbContext.Vouchers
            .AsNoTracking()
            .AnyAsync(v => v.ReversesVoucherId == voucherId && v.Status == AccountingVoucherStatus.Posted, cancellationToken)
            .ConfigureAwait(false);
        if (alreadyReversed)
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
}
