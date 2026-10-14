using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using Mediator;

namespace FSH.Modules.Inventory.Features.v1.Medicines.GetLatestLotPrices;

public sealed class GetLatestLotPricesQueryHandler(InventoryDbContext dbContext)
    : IQueryHandler<GetLatestLotPricesQuery, IReadOnlyDictionary<Guid, LatestLotPriceDto>>
{
    public async ValueTask<IReadOnlyDictionary<Guid, LatestLotPriceDto>> Handle(
        GetLatestLotPricesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var ids = (query.MedicineIds ?? []).Where(id => id != Guid.Empty).Distinct().ToList();
        return await LatestLotPrices.LoadAsync(dbContext, ids, cancellationToken).ConfigureAwait(false);
    }
}
