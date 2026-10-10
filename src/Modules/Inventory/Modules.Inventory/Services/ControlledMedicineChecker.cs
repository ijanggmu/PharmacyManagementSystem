using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

public sealed class ControlledMedicineChecker(InventoryDbContext dbContext) : IControlledMedicineChecker
{
    public async ValueTask<IReadOnlyDictionary<Guid, bool>> AreControlledAsync(
        IReadOnlyList<Guid> medicineIds, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(medicineIds);

        return await dbContext.Medicines
            .AsNoTracking()
            .Where(m => medicineIds.Contains(m.Id))
            .Select(m => new { m.Id, m.IsControlled })
            .ToDictionaryAsync(m => m.Id, m => m.IsControlled, cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask<IReadOnlyDictionary<Guid, MedicineDispensingFlags>> GetDispensingFlagsAsync(
        IReadOnlyList<Guid> medicineIds, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(medicineIds);

        return await dbContext.Medicines
            .AsNoTracking()
            .Where(m => medicineIds.Contains(m.Id))
            .Select(m => new { m.Id, m.IsControlled, m.PrescriptionRequired })
            .ToDictionaryAsync(
                m => m.Id,
                m => new MedicineDispensingFlags(m.IsControlled, m.PrescriptionRequired),
                cancellationToken)
            .ConfigureAwait(false);
    }
}
