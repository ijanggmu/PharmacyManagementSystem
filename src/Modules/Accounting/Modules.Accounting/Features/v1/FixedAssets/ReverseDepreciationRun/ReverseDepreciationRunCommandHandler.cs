using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.ReverseDepreciationRun;

/// <summary>
/// Undoes a depreciation run so it can be posted again after an asset is corrected: reverses its voucher on the
/// voucher's own date (the period keeps netting to zero) and deletes its asset months, in one transaction. Refused when
/// the run's period is locked, when an asset of the run has a later posted month (reverse the later run first), or when
/// one has been disposed since (its disposal used this depreciation).
/// </summary>
public sealed class ReverseDepreciationRunCommandHandler(
    AccountingDbContext dbContext,
    VoucherPostingService voucherPostingService,
    AccountingPostingLockService postingLockService,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<ReverseDepreciationRunCommand, Guid>
{
    public async ValueTask<Guid> Handle(ReverseDepreciationRunCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var run = await dbContext.DepreciationRuns
            .FirstOrDefaultAsync(r => r.Id == command.RunId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Depreciation run {command.RunId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(run.BranchId, $"Depreciation run {command.RunId} not found.", cancellationToken).ConfigureAwait(false);

        if (run.IsReversed)
        {
            throw Conflict("This depreciation run has already been reversed.");
        }

        if (run.VoucherId is not { } voucherId)
        {
            throw Conflict("This depreciation run has no voucher to reverse.");
        }

        DateTime voucherDate = await dbContext.Vouchers
            .AsNoTracking()
            .Where(v => v.Id == voucherId)
            .Select(v => v.VoucherDateUtc)
            .FirstAsync(cancellationToken)
            .ConfigureAwait(false);
        if (!await postingLockService.IsOpenAsync(voucherDate, cancellationToken).ConfigureAwait(false))
        {
            throw Conflict("The run's period is locked, so its depreciation can't be reversed.");
        }

        var entries = await dbContext.FixedAssetDepreciationEntries
            .Where(e => e.RunId == run.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var lastByAsset = entries.GroupBy(e => e.AssetId).ToDictionary(g => g.Key, g => g.Max(e => e.Period));
        var assetIds = lastByAsset.Keys.ToList();

        var later = await dbContext.FixedAssetDepreciationEntries
            .AsNoTracking()
            .Where(e => assetIds.Contains(e.AssetId) && e.RunId != run.Id)
            .Select(e => new { e.AssetId, e.Period })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (later.Exists(e => e.Period > lastByAsset[e.AssetId]))
        {
            throw Conflict("A later depreciation run includes assets of this run. Reverse the later run first.");
        }

        bool disposed = await dbContext.FixedAssets
            .AnyAsync(a => assetIds.Contains(a.Id) && a.IsDisposed, cancellationToken)
            .ConfigureAwait(false);
        if (disposed)
        {
            throw Conflict("An asset of this run has been disposed since; its disposal used this depreciation, so the run can't be reversed.");
        }

        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();
        return await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            var reversalId = await voucherPostingService
                .ReverseOwnedSystemVoucherAsync(voucherId, actor, voucherDate, "depreciation run reversed", cancellationToken)
                .ConfigureAwait(false);
            dbContext.FixedAssetDepreciationEntries.RemoveRange(entries);
            run.MarkReversed(actor, reversalId);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return reversalId;
        }, cancellationToken).ConfigureAwait(false);
    }

    private static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
}
