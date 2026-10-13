using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.RunDepreciation;

/// <summary>
/// Posts book depreciation for a fiscal month or year, exactly what <see cref="DepreciationPeriodPlan"/> previews: per
/// branch, a <see cref="DepreciationRun"/>, one <see cref="FixedAssetDepreciationEntry"/> per asset month and one
/// <c>system_depreciation</c> voucher (Dr Depreciation Expense per asset / Cr Accumulated Depreciation), all in one
/// transaction. Months already posted are skipped (idempotent); a period with nothing left returns an empty result. A
/// period that has not ended or is locked is refused (409 with the reason). Two concurrent runs of one period collide on
/// the unique (asset, month) index and the second fails with a conflict.
/// </summary>
public sealed partial class RunDepreciationCommandHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    AccountingPostingLockService postingLockService,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider,
    ILogger<RunDepreciationCommandHandler> logger) : ICommandHandler<RunDepreciationCommand, DepreciationRunResultDto>
{
    public async ValueTask<DepreciationRunResultDto> Handle(RunDepreciationCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(command.BranchId, cancellationToken).ConfigureAwait(false);
        DateOnly today = NepalDate.FromUtc(timeProvider.GetUtcNow().UtcDateTime);
        var plan = await DepreciationPeriodPlan
            .BuildAsync(dbContext, postingLockService, command.FiscalYear, command.Month, branchFilter, today, cancellationToken)
            .ConfigureAwait(false);

        if (plan.Planned.Count == 0)
        {
            // Nothing left to post (already posted, or no asset depreciates in the period): a repeated run is a no-op.
            return new DepreciationRunResultDto(plan.FiscalYear, plan.FromMonth, plan.ToMonth, [], [], 0m, 0);
        }

        if (plan.Blocker is { } blocker)
        {
            throw new CustomException(blocker, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var expenseId = await FixedAssetAccounts.DepreciationExpenseAsync(dbContext, cancellationToken).ConfigureAwait(false);
        var accumulatedId = await FixedAssetAccounts.AccumulatedDepreciationAsync(dbContext, cancellationToken).ConfigureAwait(false);
        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();

        var result = await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            var runIds = new List<Guid>();
            var voucherIds = new List<Guid>();
            foreach (var branch in plan.Planned.GroupBy(p => p.Asset.BranchId).OrderBy(g => g.Key))
            {
                var items = branch.ToList();
                var run = DepreciationRun.Create(
                    plan.FiscalYear, plan.FromMonth, plan.ToMonth, branch.Key, items.Sum(p => p.Amount), items.Count, actor);
                dbContext.DepreciationRuns.Add(run);
                foreach (var item in items)
                {
                    dbContext.FixedAssetDepreciationEntries.AddRange(item.Months.Select(m =>
                        FixedAssetDepreciationEntry.Create(item.Asset.Id, run.Id, m.Period, m.Amount, item.Asset.BranchId)));
                }

                await SaveAsync(cancellationToken).ConfigureAwait(false);

                var lines = FixedAssetPosting.DepreciationLines(
                    items.ConvertAll(p => new DepreciationCharge(p.Asset.Id, p.Asset.Name, p.Amount)), expenseId, accumulatedId, plan.Label);
                var voucherId = await voucherPostingService.PostSystemVoucherAsync(
                    new PostVoucherRequest(
                        VoucherType: DepreciationRun.VoucherType,
                        ReferenceType: DepreciationRun.ReferenceType,
                        ReferenceId: run.Id,
                        Narration: $"Depreciation for {plan.Label} ({items.Count} asset{(items.Count == 1 ? string.Empty : "s")})",
                        Lines: lines,
                        BranchId: branch.Key,
                        VoucherDateUtc: plan.VoucherDateUtc),
                    cancellationToken).ConfigureAwait(false);

                run.AttachVoucher(voucherId);
                await SaveAsync(cancellationToken).ConfigureAwait(false);
                runIds.Add(run.Id);
                voucherIds.Add(voucherId);
            }

            return new DepreciationRunResultDto(
                plan.FiscalYear, plan.FromMonth, plan.ToMonth, runIds, voucherIds,
                plan.Planned.Sum(p => p.Amount), plan.Planned.Sum(p => p.Months.Count));
        }, cancellationToken).ConfigureAwait(false);

        LogPosted(logger, plan.Label, result.TotalAmount, result.VoucherIds.Count);
        return result;
    }

    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException ex)
        {
            throw new CustomException(
                "Depreciation for this period was posted at the same time by another request. Refresh the preview and retry.",
                ex, HttpStatusCode.Conflict);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "[Accounting] posted depreciation for {Period}: {Amount} in {VoucherCount} vouchers")]
    private static partial void LogPosted(ILogger logger, string period, decimal amount, int voucherCount);
}
