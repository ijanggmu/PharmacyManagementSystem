using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Sales.Contracts.Fiscal;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.GetTaxDepreciationSchedule;

/// <summary>
/// Tax depreciation per Schedule 2 pool for an income year (<see cref="NepalTaxDepreciation"/>), from every asset in the
/// register, tenant-wide: the income tax return is filed per PAN, not per branch. Tax depreciation is not posted to the
/// ledger — the books carry book depreciation; the difference is a tax adjustment on the return.
/// </summary>
public sealed class GetTaxDepreciationScheduleQueryHandler(AccountingDbContext dbContext)
    : IQueryHandler<GetTaxDepreciationScheduleQuery, TaxDepreciationScheduleDto>
{
    public async ValueTask<TaxDepreciationScheduleDto> Handle(GetTaxDepreciationScheduleQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        FixedAssetRegister.EnsureKnownFiscalYear(query.FiscalYear);

        var assets = await dbContext.FixedAssets.AsNoTracking().ToListAsync(cancellationToken).ConfigureAwait(false);
        var facts = assets.ConvertAll(ToFacts);
        var rows = NepalTaxDepreciation.ForYear(facts, query.FiscalYear)
            .Select(r => new TaxPoolScheduleRowDto(
                r.Pool.Code, r.Pool.Name, r.Pool.RatePercent, r.OpeningBase, r.AdditionsFull, r.AdditionsTwoThirds, r.AdditionsOneThird,
                r.AdditionsIncluded, r.DisposalProceeds, r.DepreciationBase, r.Depreciation, r.Recapture, r.TerminalDeduction,
                r.DeferredAdditions, r.ClosingBase, r.AssetCount))
            .ToList();

        return new TaxDepreciationScheduleDto(
            query.FiscalYear, NepalFiscalYear.Label(query.FiscalYear), rows,
            rows.Sum(r => r.Depreciation), rows.Sum(r => r.Recapture), rows.Sum(r => r.TerminalDeduction), NepalTaxPoolDefaults.Note);
    }

    /// <summary>An asset's tax facts: an opening asset enters its pool in its go-live year at its opening tax WDV (its
    /// net book value when none was given); a new one is an addition in its acquisition year.</summary>
    internal static TaxAssetFacts ToFacts(FixedAsset asset)
    {
        ArgumentNullException.ThrowIfNull(asset);

        var acquired = FiscalPeriod.FromIndex(asset.AcquisitionPeriod);
        int firstYear = asset.IsOpening ? FiscalPeriod.FromIndex(asset.StartPeriod).FiscalYear : acquired.FiscalYear;
        decimal openingBase = asset.IsOpening
            ? asset.OpeningTaxWrittenDownValue ?? asset.Cost - asset.OpeningAccumulatedDepreciation
            : 0m;
        int? disposalYear = asset.DisposedOnUtc is { } at ? FiscalPeriod.OfUtc(at).FiscalYear : null;
        int? life = asset.TaxUsefulLifeYears ?? (asset.UsefulLifeMonths is { } months ? Math.Max(1, months / 12) : null);

        return new TaxAssetFacts(
            asset.TaxPool, asset.Cost, acquired, asset.IsOpening, firstYear, openingBase, disposalYear, asset.DisposalProceeds ?? 0m, life);
    }
}
