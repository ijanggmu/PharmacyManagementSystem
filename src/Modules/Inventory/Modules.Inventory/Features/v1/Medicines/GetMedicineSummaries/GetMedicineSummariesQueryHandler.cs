using FSH.Framework.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.GetMedicineSummaries;

public sealed class GetMedicineSummariesQueryHandler(InventoryDbContext dbContext)
    : IQueryHandler<GetMedicineSummariesQuery, IReadOnlyList<MedicineSummaryDto>>
{
    public async ValueTask<IReadOnlyList<MedicineSummaryDto>> Handle(
        GetMedicineSummariesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var ids = (query.MedicineIds ?? []).Where(id => id != Guid.Empty).Distinct().ToList();
        if (ids.Count == 0)
        {
            return [];
        }

        // Soft-deleted medicines still label the sales they were sold on; the tenant filter stays on.
        return await dbContext.Medicines
            .AsNoTracking()
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .Where(m => ids.Contains(m.Id))
            .Select(m => new MedicineSummaryDto(m.Id, m.Name, m.GenericName, m.Strength, m.Form))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}
