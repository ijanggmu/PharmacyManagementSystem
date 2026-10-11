using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.RestoreMedicine;

public sealed class RestoreMedicineCommandHandler(InventoryDbContext dbContext)
    : ICommandHandler<RestoreMedicineCommand, Guid>
{
    public async ValueTask<Guid> Handle(RestoreMedicineCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var medicine = await dbContext.Medicines
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .FirstOrDefaultAsync(m => m.Id == command.MedicineId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Medicine {command.MedicineId} not found.");

        medicine.Restore();
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return medicine.Id;
    }
}
