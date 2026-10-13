using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Domain;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.GetTaxPools;

public sealed class GetTaxPoolsQueryHandler : IQueryHandler<GetTaxPoolsQuery, IReadOnlyList<TaxPoolDto>>
{
    public ValueTask<IReadOnlyList<TaxPoolDto>> Handle(GetTaxPoolsQuery query, CancellationToken cancellationToken)
    {
        IReadOnlyList<TaxPoolDto> pools = NepalTaxPoolDefaults.All
            .Select(p => new TaxPoolDto(p.Code, p.Name, p.RatePercent, p.PerAssetUsefulLife, p.Examples))
            .ToList();
        return ValueTask.FromResult(pools);
    }
}
