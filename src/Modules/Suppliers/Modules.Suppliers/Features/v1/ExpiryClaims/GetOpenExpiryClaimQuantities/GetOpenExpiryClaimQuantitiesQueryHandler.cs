using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Services;
using Mediator;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims.GetOpenExpiryClaimQuantities;

/// <summary>
/// In-process lookup for Inventory (no endpoint): the units open claims hold per lot, so the expired-stock list can
/// badge those lots and a write-off can refuse them while the supplier is still deciding.
/// </summary>
public sealed class GetOpenExpiryClaimQuantitiesQueryHandler(SuppliersDbContext dbContext)
    : IQueryHandler<GetOpenExpiryClaimQuantitiesQuery, IReadOnlyDictionary<Guid, decimal>>
{
    public async ValueTask<IReadOnlyDictionary<Guid, decimal>> Handle(
        GetOpenExpiryClaimQuantitiesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        return await ExpiryClaimLots.OpenClaimedAsync(dbContext, query.BatchIds, null, cancellationToken).ConfigureAwait(false);
    }
}
