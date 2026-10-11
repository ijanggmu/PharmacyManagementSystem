using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.DeleteMedicine;

public sealed class DeleteMedicineCommandHandler(InventoryDbContext dbContext)
    : ICommandHandler<DeleteMedicineCommand, Unit>
{
    public async ValueTask<Unit> Handle(DeleteMedicineCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var medicine = await dbContext.Medicines
            .FirstOrDefaultAsync(m => m.Id == command.MedicineId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Medicine {command.MedicineId} not found.");

        dbContext.Medicines.Remove(medicine);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return Unit.Value;
    }
}
