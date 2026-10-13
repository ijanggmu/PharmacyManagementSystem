using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Sales.Contracts.Fiscal;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets;

/// <summary>Reads shared by the fixed asset handlers: posted depreciation per asset and the register DTO.</summary>
internal static class FixedAssetRegister
{
    /// <summary>The months posted per asset (all assets when <paramref name="assetIds"/> is null).</summary>
    public static async Task<Dictionary<Guid, PostedDepreciation>> LoadPostedAsync(
        AccountingDbContext dbContext, IReadOnlyCollection<Guid>? assetIds, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var query = dbContext.FixedAssetDepreciationEntries.AsNoTracking();
        if (assetIds is not null)
        {
            query = query.Where(e => assetIds.Contains(e.AssetId));
        }

        var rows = await query
            .Select(e => new { e.AssetId, e.Period, e.Amount })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows
            .GroupBy(r => r.AssetId)
            .ToDictionary(
                g => g.Key,
                g => new PostedDepreciation(g.Select(r => r.Period).ToHashSet(), g.Sum(r => r.Amount)));
    }

    public static PostedDepreciation For(this IReadOnlyDictionary<Guid, PostedDepreciation> posted, Guid assetId) =>
        posted.TryGetValue(assetId, out var p) ? p : PostedDepreciation.None;

    public static FixedAssetDto ToDto(FixedAsset asset, PostedDepreciation posted)
    {
        ArgumentNullException.ThrowIfNull(asset);
        ArgumentNullException.ThrowIfNull(posted);

        decimal accumulated = asset.IsDisposed
            ? asset.DisposalAccumulatedDepreciation ?? 0m
            : asset.OpeningAccumulatedDepreciation + posted.Total;
        decimal netBookValue = asset.IsDisposed ? 0m : asset.Cost - accumulated;
        string? through = posted.LastPeriod is { } last ? FiscalPeriod.FromIndex(last).Label : null;

        return new FixedAssetDto(
            asset.Id, asset.Name, asset.Category, asset.AssetTag, asset.Location, asset.BranchId, asset.AcquisitionDateUtc,
            FixedAssetVouchers.ToValue(asset.Source), asset.PaymentMethod, asset.SupplierId, asset.VendorName, asset.SupplierVatNumber,
            asset.BillNumber, asset.Cost, asset.VatAmount, asset.ResidualValue, FixedAssetVouchers.ToValue(asset.Method),
            asset.UsefulLifeMonths, asset.RatePercent, asset.TaxPool, asset.TaxUsefulLifeYears, asset.OpeningAccumulatedDepreciation,
            asset.OpeningTaxWrittenDownValue, accumulated, netBookValue, through, posted.Periods.Count > 0,
            asset.IsDisposed ? FixedAssetValues.Statuses.Disposed : FixedAssetValues.Statuses.Active,
            asset.DisposedOnUtc, asset.DisposalKind is { } kind ? FixedAssetVouchers.ToValue(kind) : null,
            asset.DisposalProceeds, asset.DisposalGainLoss, asset.Notes, asset.CreatedBy, asset.CreatedAtUtc,
            asset.DisposalVatAmount);
    }

    /// <summary>The fiscal year must be one the Nepali calendar tables cover.</summary>
    public static void EnsureKnownFiscalYear(int fiscalYear)
    {
        if (fiscalYear < NepalFiscalYear.FirstStartYear || fiscalYear > NepalFiscalYear.LastStartYear)
        {
            throw new CustomException(
                $"Fiscal year {fiscalYear} is outside the supported range.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }
    }
}
