using FSH.Framework.Core.Exceptions;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.UpdatePrescription;

public sealed class UpdatePrescriptionCommandHandler(PrescriptionsDbContext dbContext)
    : ICommandHandler<UpdatePrescriptionCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdatePrescriptionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var prescription = await dbContext.Prescriptions
            .Include(p => p.Items)
            .FirstOrDefaultAsync(p => p.Id == command.PrescriptionId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Prescription {command.PrescriptionId} not found.");

        prescription.Update(command.DoctorName, command.ExpiryDate, command.Notes, command.ClearNotes);

        if (command.Items is { Count: > 0 } itemUpdates)
        {
            foreach (var update in itemUpdates)
            {
                prescription.UpdateItemDosageInstructions(update.ItemId, update.DosageInstructions);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return prescription.Id;
    }
}
