using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FixedAssets;

/// <summary>
/// Edits a register entry. The descriptive fields can always change. The depreciation terms (residual value, method,
/// useful life, rate, tax pool, tax useful life) can change only while no depreciation has been posted for the asset —
/// afterwards they would no longer explain the posted amounts (a 409 says so; reverse the runs first). Cost, date and
/// how it was paid are fixed by the acquisition voucher: delete the asset and add it again to change them. A disposed
/// asset can't be edited.
/// </summary>
public sealed record UpdateFixedAssetCommand(
    Guid Id,
    string Name,
    string Category,
    string DepreciationMethod,
    string TaxPool,
    decimal ResidualValue = 0m,
    int? UsefulLifeMonths = null,
    decimal? RatePercent = null,
    int? TaxUsefulLifeYears = null,
    string? AssetTag = null,
    string? Location = null,
    string? Notes = null) : ICommand<Guid>;
