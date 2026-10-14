using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Fiscal;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.GetDepreciationSchedule;

/// <summary>
/// Book depreciation schedule of a fiscal year, per asset: cost and accumulated depreciation brought forward, additions
/// and disposals in the year, the twelve monthly charges (posted, or the schedule's projection for months not yet run)
/// and the closing net book value. An opening (pre-go-live) asset is brought forward in every year it is on the
/// schedule, its go-live year included: its cost and depreciation to date are the opening position the books started
/// from, not something bought in the year.
/// </summary>
public sealed class GetDepreciationScheduleQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetDepreciationScheduleQuery, DepreciationScheduleDto>
{
    public async ValueTask<DepreciationScheduleDto> Handle(GetDepreciationScheduleQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        FixedAssetRegister.EnsureKnownFiscalYear(query.FiscalYear);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        int yearFirst = new FiscalPeriod(query.FiscalYear, 1).Index;
        int yearLast = new FiscalPeriod(query.FiscalYear, 12).Index;

        var q = dbContext.FixedAssets.AsNoTracking().Where(a => a.StartPeriod <= yearLast);
        if (branchFilter is { } branchId)
        {
            q = q.Where(a => a.BranchId == branchId);
        }

        var assets = (await q.ToListAsync(cancellationToken).ConfigureAwait(false))
            .Where(a => a.DisposalPeriod is null || a.DisposalPeriod >= yearFirst)
            .ToList();
        var posted = await FixedAssetRegister.LoadPostedAsync(dbContext, assets.ConvertAll(a => a.Id), cancellationToken).ConfigureAwait(false);

        var rows = assets
            .OrderBy(a => a.Category, StringComparer.OrdinalIgnoreCase)
            .ThenBy(a => a.Name, StringComparer.OrdinalIgnoreCase)
            .Select(a => BuildRow(a, posted.For(a.Id), yearFirst, yearLast))
            .ToList();

        var (start, end) = NepalFiscalYear.Range(query.FiscalYear);
        return new DepreciationScheduleDto(
            query.FiscalYear, NepalFiscalYear.Label(query.FiscalYear), start, end, rows,
            rows.Sum(r => r.DepreciationForYear), rows.Sum(r => r.DepreciationPosted), rows.Sum(r => r.ClosingNetBookValue));
    }

    /// <summary>One asset's row for the year [<paramref name="yearFirst"/>, <paramref name="yearLast"/>] (period indexes).</summary>
    internal static DepreciationScheduleRowDto BuildRow(FixedAsset asset, PostedDepreciation posted, int yearFirst, int yearLast)
    {
        ArgumentNullException.ThrowIfNull(asset);
        ArgumentNullException.ThrowIfNull(posted);

        var schedule = BookDepreciation.Schedule(asset.Terms, yearLast);
        bool broughtForward = asset.IsOpening || asset.AcquisitionPeriod < yearFirst;
        bool disposedInYear = asset.DisposalPeriod is { } d && d >= yearFirst && d <= yearLast;

        var months = new decimal[12];
        var postedMonths = new bool[12];
        foreach (var entry in schedule.Where(s => s.Period >= yearFirst))
        {
            months[entry.Period - yearFirst] = entry.Amount;
            postedMonths[entry.Period - yearFirst] = posted.Periods.Contains(entry.Period);
        }

        decimal openingCost = broughtForward ? asset.Cost : 0m;
        decimal additions = broughtForward ? 0m : asset.Cost;
        decimal disposals = disposedInYear ? asset.Cost : 0m;
        decimal openingAccumulated = broughtForward
            ? asset.OpeningAccumulatedDepreciation + schedule.Where(s => s.Period < yearFirst).Sum(s => s.Amount)
            : 0m;
        decimal takenOver = broughtForward ? 0m : asset.OpeningAccumulatedDepreciation;
        decimal forYear = months.Sum();
        decimal postedForYear = Enumerable.Range(0, 12).Where(i => postedMonths[i]).Sum(i => months[i]);
        decimal onDisposal = disposedInYear ? asset.DisposalAccumulatedDepreciation ?? 0m : 0m;
        decimal closingCost = openingCost + additions - disposals;
        decimal closingAccumulated = openingAccumulated + takenOver + forYear - onDisposal;

        return new DepreciationScheduleRowDto(
            asset.Id, asset.Name, asset.Category, asset.AssetTag, asset.BranchId, FixedAssetVouchers.ToValue(asset.Method),
            openingCost, additions, disposals, closingCost, openingAccumulated, forYear, postedForYear, onDisposal, closingAccumulated,
            openingCost - openingAccumulated, closingCost - closingAccumulated, months, postedMonths);
    }
}
