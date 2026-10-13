using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Sales.Contracts.Fiscal;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets;

/// <summary>
/// The work of one depreciation period — shared by the preview and the run so both always show and post the same thing:
/// the months (<see cref="FromMonth"/>–<see cref="ToMonth"/> of <see cref="FiscalYear"/>), the voucher date (the last
/// second of the period's last Nepal day — after the day's ordinary vouchers, before a year-end close), what is still
/// unposted per asset, and why it can't be posted yet (<see cref="Blocker"/>).
/// </summary>
internal sealed record DepreciationPeriodPlan(
    int FiscalYear,
    int FromMonth,
    int ToMonth,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    DateTime VoucherDateUtc,
    IReadOnlyList<PlannedDepreciation> Planned,
    int AlreadyPostedMonths,
    string? Blocker)
{
    public string Label => FixedAssetPosting.PeriodLabel(FiscalYear, FromMonth, ToMonth);

    public static async Task<DepreciationPeriodPlan> BuildAsync(
        AccountingDbContext dbContext,
        AccountingPostingLockService postingLockService,
        int fiscalYear,
        int? month,
        Guid? branchFilter,
        DateOnly today,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(postingLockService);
        FixedAssetRegister.EnsureKnownFiscalYear(fiscalYear);

        int fromMonth = month ?? 1;
        int toMonth = month ?? 12;
        var from = new FiscalPeriod(fiscalYear, fromMonth);
        var to = new FiscalPeriod(fiscalYear, toMonth);
        DateOnly periodStart = month is null ? NepalFiscalYear.Range(fiscalYear).Start : from.Days().First;
        DateOnly periodEnd = month is null ? NepalFiscalYear.Range(fiscalYear).End : to.Days().Last;
        DateTime voucherDateUtc = NepalDate.EndExclusiveUtc(periodEnd).AddSeconds(-1);

        var query = dbContext.FixedAssets.AsNoTracking().Where(a => a.StartPeriod <= to.Index);
        if (branchFilter is { } branchId)
        {
            query = query.Where(a => a.BranchId == branchId);
        }

        var assets = await query.ToListAsync(cancellationToken).ConfigureAwait(false);
        var posted = await FixedAssetRegister.LoadPostedAsync(dbContext, assets.ConvertAll(a => a.Id), cancellationToken).ConfigureAwait(false);
        var planned = DepreciationPlanner.Plan(assets, posted, from.Index, to.Index);
        int alreadyPosted = posted.Values.Sum(p => p.Periods.Count(x => x >= from.Index && x <= to.Index));

        string? blocker = null;
        if (periodEnd > today)
        {
            blocker = $"The period ends on {periodEnd:yyyy-MM-dd}; depreciation can be posted from its last day.";
        }
        else if (!await postingLockService.IsOpenAsync(voucherDateUtc, cancellationToken).ConfigureAwait(false))
        {
            blocker = "The period is locked (posting lock / closed fiscal year), so depreciation can't be posted into it.";
        }
        else if (planned.Count == 0)
        {
            blocker = alreadyPosted > 0
                ? "Depreciation for this period is already posted."
                : "No asset has depreciation to post for this period.";
        }

        return new DepreciationPeriodPlan(
            fiscalYear, fromMonth, toMonth, periodStart, periodEnd, voucherDateUtc, planned, alreadyPosted, blocker);
    }

    public DepreciationPreviewDto ToPreview()
    {
        var lines = Planned
            .OrderBy(p => p.Asset.Category, StringComparer.OrdinalIgnoreCase)
            .ThenBy(p => p.Asset.Name, StringComparer.OrdinalIgnoreCase)
            .Select(p => new DepreciationPreviewLineDto(
                p.Asset.Id, p.Asset.Name, p.Asset.Category, p.Asset.BranchId, FixedAssetVouchers.ToValue(p.Asset.Method),
                p.Asset.Cost, p.AccumulatedBefore, p.Months.Count, p.Amount, p.Asset.Cost - p.AccumulatedBefore - p.Amount))
            .ToList();
        var branches = Planned
            .GroupBy(p => p.Asset.BranchId)
            .Select(g => new DepreciationPreviewBranchDto(g.Key, g.Count(), g.Sum(p => p.Amount)))
            .ToList();

        return new DepreciationPreviewDto(
            FiscalYear, NepalFiscalYear.Label(FiscalYear), FromMonth, ToMonth, Label, PeriodStart, PeriodEnd,
            lines, branches, lines.Sum(l => l.Amount), AlreadyPostedMonths, Blocker is null, Blocker);
    }
}
