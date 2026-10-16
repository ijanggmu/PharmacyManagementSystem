using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetControlledMedicines;

public sealed class GetControlledMedicinesQueryHandler(InventoryDbContext dbContext)
    : IQueryHandler<GetControlledMedicinesQuery, IReadOnlyList<ControlledMedicineDto>>
{
    public async ValueTask<IReadOnlyList<ControlledMedicineDto>> Handle(
        GetControlledMedicinesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        return await dbContext.Medicines
            .AsNoTracking()
            .Where(m => m.IsControlled)
            .Select(m => new ControlledMedicineDto(m.Id, m.Name, m.GenericName, m.ControlledSchedule, m.Form, m.Strength))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}
