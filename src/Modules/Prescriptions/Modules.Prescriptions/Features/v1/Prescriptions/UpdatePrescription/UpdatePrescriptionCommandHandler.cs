using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.UpdatePrescription;

/// <summary>
/// Edits a prescription's header and item directions under the same item-row lock every dispense takes
/// (<see cref="PrescriptionWrites"/>), so an edit and a concurrent sale/refill/cancel serialize instead of one
/// silently overwriting the other. A conflict that slips past the lock surfaces as 409, not 500.
/// </summary>
public sealed class UpdatePrescriptionCommandHandler(
    PrescriptionsDbContext dbContext,
    AmbientDbTransactionRegistry ambientTransactions)
    : ICommandHandler<UpdatePrescriptionCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdatePrescriptionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        try
        {
            await PrescriptionWrites.RunInTransactionAsync(dbContext, ambientTransactions, async ct =>
            {
                dbContext.ChangeTracker.Clear();
                await PrescriptionWrites.LockItemsAsync(dbContext, [command.PrescriptionId], ct).ConfigureAwait(false);

                var prescription = await dbContext.Prescriptions
                    .Include(p => p.Items)
                    .FirstOrDefaultAsync(p => p.Id == command.PrescriptionId, ct)
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

                await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
            }, cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            throw PrescriptionWrites.Conflict(command.PrescriptionId, ex);
        }

        return command.PrescriptionId;
    }
}
