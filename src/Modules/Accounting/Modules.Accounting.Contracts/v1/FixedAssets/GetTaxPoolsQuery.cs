using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FixedAssets;

/// <summary>The Income Tax Act 2058 Schedule 2 depreciation pools and their default rates.</summary>
public sealed record GetTaxPoolsQuery : IQuery<IReadOnlyList<TaxPoolDto>>;
