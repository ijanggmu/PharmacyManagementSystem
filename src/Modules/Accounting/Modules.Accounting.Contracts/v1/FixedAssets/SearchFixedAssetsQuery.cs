using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FixedAssets;

/// <summary>The fixed asset register with each asset's cost, accumulated depreciation and net book value.
/// <paramref name="Status"/> <c>active</c> / <c>disposed</c> (null = both); <paramref name="BranchId"/> null = every
/// branch the caller may see; <paramref name="Search"/> matches name, category, tag or location.</summary>
public sealed record SearchFixedAssetsQuery(string? Status = null, Guid? BranchId = null, string? Search = null)
    : IQuery<IReadOnlyList<FixedAssetDto>>;
