using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.GetMedicineNames;

public sealed class GetMedicineNamesQueryHandler(InventoryDbContext dbContext)
    : IQueryHandler<GetMedicineNamesQuery, IReadOnlyDictionary<Guid, string>>
{
    public async ValueTask<IReadOnlyDictionary<Guid, string>> Handle(GetMedicineNamesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var ids = (query.MedicineIds ?? []).Where(id => id != Guid.Empty).Distinct().ToList();
        if (ids.Count == 0)
        {
            return new Dictionary<Guid, string>();
        }

        return await dbContext.Medicines
            .AsNoTracking()
            .Where(m => ids.Contains(m.Id))
            .Select(m => new { m.Id, m.Name })
            .ToDictionaryAsync(m => m.Id, m => m.Name, cancellationToken)
            .ConfigureAwait(false);
    }
}
