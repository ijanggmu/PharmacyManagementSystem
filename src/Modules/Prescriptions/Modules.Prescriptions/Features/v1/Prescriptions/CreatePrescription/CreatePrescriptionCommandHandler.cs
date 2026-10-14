using FSH.Framework.Core.Context;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Services;
using Mediator;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.CreatePrescription;

public sealed class CreatePrescriptionCommandHandler(
    PrescriptionsDbContext dbContext,
    ICurrentUser currentUser,
    PrescriptionNumberService numberService,
    PrescriptionIssueChecks issueChecks)
    : ICommandHandler<CreatePrescriptionCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreatePrescriptionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Customer/medicine existence and the date/validity/refill limits — before a number is reserved, so a
        // rejected prescription doesn't burn one.
        await issueChecks.EnsureValidAsync(command, cancellationToken).ConfigureAwait(false);

        // GetUserId returns Guid.Empty when there is no authenticated user; store null instead.
        var userId = currentUser.GetUserId();
        Guid? createdByUserId = userId == Guid.Empty ? null : userId;

        var prescriptionNumber = await numberService.ReserveNextAsync(cancellationToken).ConfigureAwait(false);

        var prescription = Prescription.Create(
            command.CustomerId, command.DoctorName, command.PrescriptionDate, command.ExpiryDate,
            createdByUserId, command.Notes, prescriptionNumber);

        foreach (var item in command.Items)
        {
            prescription.AddItem(item.MedicineId, item.PrescribedQuantity, item.RefillsAllowed, item.DosageInstructions);
        }

        dbContext.Prescriptions.Add(prescription);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return prescription.Id;
    }
}
