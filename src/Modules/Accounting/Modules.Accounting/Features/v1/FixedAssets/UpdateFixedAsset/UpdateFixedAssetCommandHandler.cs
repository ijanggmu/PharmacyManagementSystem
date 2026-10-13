using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.UpdateFixedAsset;

/// <summary>Edits a register entry: descriptive fields always; depreciation terms only while no depreciation is posted
/// for the asset (the posted months must stay explained by its terms). No voucher changes.</summary>
public sealed class UpdateFixedAssetCommandHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : ICommandHandler<UpdateFixedAssetCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateFixedAssetCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var asset = await dbContext.FixedAssets
            .FirstOrDefaultAsync(a => a.Id == command.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Fixed asset {command.Id} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(asset.BranchId, $"Fixed asset {command.Id} not found.", cancellationToken).ConfigureAwait(false);

        if (asset.IsDisposed)
        {
            throw new CustomException("A disposed asset can't be edited.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var method = FixedAssetVouchers.ParseMethod(command.DepreciationMethod)
            ?? throw new CustomException("Unknown depreciation method.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        string pool = command.TaxPool.Trim().ToUpperInvariant();
        bool termsChanged = asset.ResidualValue != command.ResidualValue
            || asset.Method != method
            || (method == FixedAssetDepreciationMethod.StraightLine && asset.UsefulLifeMonths != command.UsefulLifeMonths)
            || (method == FixedAssetDepreciationMethod.WrittenDownValue && asset.RatePercent != command.RatePercent)
            || !string.Equals(asset.TaxPool, pool, StringComparison.Ordinal)
            || asset.TaxUsefulLifeYears != command.TaxUsefulLifeYears;

        if (termsChanged)
        {
            bool depreciated = await dbContext.FixedAssetDepreciationEntries
                .AnyAsync(e => e.AssetId == asset.Id, cancellationToken)
                .ConfigureAwait(false);
            if (depreciated)
            {
                throw new CustomException(
                    "Depreciation has already been posted for this asset, so its depreciation terms can't change. " +
                    "Reverse its depreciation runs first, or change only the name, category, tag, location or notes.",
                    (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            }

            if (command.ResidualValue >= asset.Cost)
            {
                throw new CustomException(
                    "The residual value must be less than the asset's cost.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            asset.SetDepreciationTerms(
                command.ResidualValue, method, command.UsefulLifeMonths, command.RatePercent, pool, command.TaxUsefulLifeYears);
        }

        asset.Describe(command.Name, command.Category, command.AssetTag, command.Location, command.Notes);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return asset.Id;
    }
}
