using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Services;
using Mediator;

namespace FSH.Modules.Appointments.Features.v1.Doctors.UpdateDoctor;

public sealed class UpdateDoctorCommandHandler(AppointmentsDbContext dbContext)
    : ICommandHandler<UpdateDoctorCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateDoctorCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var doctor = await DoctorWrites.LoadAsync(dbContext, command.DoctorId, cancellationToken).ConfigureAwait(false);
        await DoctorWrites.EnsureNmcNumberFreeAsync(dbContext, command.NmcNumber, doctor.Id, cancellationToken)
            .ConfigureAwait(false);

        doctor.Update(
            command.Name, command.NmcNumber, command.Speciality, command.Phone, command.Fee,
            DoctorMapping.ParseShareType(command.ShareType), command.ShareValue);

        await DoctorWrites.SaveAsync(dbContext, cancellationToken).ConfigureAwait(false);
        return doctor.Id;
    }
}
