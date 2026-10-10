using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.DeletePrescription;

public sealed class DeletePrescriptionCommandHandler(PrescriptionsDbContext dbContext)
    : ICommandHandler<DeletePrescriptionCommand, Guid>
{
    public async ValueTask<Guid> Handle(DeletePrescriptionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var prescription = await dbContext.Prescriptions
            .Include(p => p.Items)
            .FirstOrDefaultAsync(p => p.Id == command.PrescriptionId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Prescription {command.PrescriptionId} not found.");

        // Dispensed prescriptions are audit records (controlled-substance trail): cancel them instead.
        if (prescription.HasDispensedItems)
        {
            throw new CustomException(
                "Prescription has dispensed items and cannot be deleted. Cancel it instead.",
                (IEnumerable<string>?)null,
                HttpStatusCode.Conflict);
        }

        dbContext.Prescriptions.Remove(prescription);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return command.PrescriptionId;
    }
}
