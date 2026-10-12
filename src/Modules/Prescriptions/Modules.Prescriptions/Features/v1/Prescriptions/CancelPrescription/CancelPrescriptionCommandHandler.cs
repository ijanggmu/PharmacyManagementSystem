using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.CancelPrescription;

/// <summary>
/// Cancels a prescription under the item-row lock every dispense takes (<see cref="PrescriptionWrites"/>):
/// a sale or refill that is dispensing against it either finishes first or sees it cancelled — never both
/// "dispensed after cancellation". A conflict that slips past the lock surfaces as 409, not 500.
/// </summary>
public sealed class CancelPrescriptionCommandHandler(
    PrescriptionsDbContext dbContext,
    AmbientDbTransactionRegistry ambientTransactions)
    : ICommandHandler<CancelPrescriptionCommand, Guid>
{
    public async ValueTask<Guid> Handle(CancelPrescriptionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        try
        {
            await PrescriptionWrites.RunInTransactionAsync(dbContext, ambientTransactions, async ct =>
            {
                dbContext.ChangeTracker.Clear();
                await PrescriptionWrites.LockItemsAsync(dbContext, [command.PrescriptionId], ct).ConfigureAwait(false);

                var prescription = await dbContext.Prescriptions
                    .FirstOrDefaultAsync(p => p.Id == command.PrescriptionId, ct)
                    .ConfigureAwait(false)
                    ?? throw new NotFoundException($"Prescription {command.PrescriptionId} not found.");

                prescription.Cancel(command.Reason);
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
