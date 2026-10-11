using FSH.Framework.Core.Exceptions;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.CancelPrescription;

public sealed class CancelPrescriptionCommandHandler(PrescriptionsDbContext dbContext)
    : ICommandHandler<CancelPrescriptionCommand, Guid>
{
    public async ValueTask<Guid> Handle(CancelPrescriptionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var prescription = await dbContext.Prescriptions
            .FirstOrDefaultAsync(p => p.Id == command.PrescriptionId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Prescription {command.PrescriptionId} not found.");

        prescription.Cancel(command.Reason);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return prescription.Id;
    }
}
