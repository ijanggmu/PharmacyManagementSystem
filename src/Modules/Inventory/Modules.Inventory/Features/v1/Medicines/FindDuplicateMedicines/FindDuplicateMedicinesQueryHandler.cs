using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using Mediator;

namespace FSH.Modules.Inventory.Features.v1.Medicines.FindDuplicateMedicines;

public sealed class FindDuplicateMedicinesQueryHandler(InventoryDbContext dbContext)
    : IQueryHandler<FindDuplicateMedicinesQuery, List<DuplicateMedicineDto>>
{
    public async ValueTask<List<DuplicateMedicineDto>> Handle(
        FindDuplicateMedicinesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        return await MedicineIdentityGuard.FindDuplicatesAsync(
            dbContext, query.Name, query.Strength, query.Form, query.ExcludeId, cancellationToken)
            .ConfigureAwait(false);
    }
}
