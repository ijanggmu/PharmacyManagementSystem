using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using FSH.Modules.Appointments.Services;
using Mediator;

namespace FSH.Modules.Appointments.Features.v1.Doctors.CreateDoctor;

public sealed class CreateDoctorCommandHandler(AppointmentsDbContext dbContext, TimeProvider timeProvider)
    : ICommandHandler<CreateDoctorCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateDoctorCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await DoctorWrites.EnsureNmcNumberFreeAsync(dbContext, command.NmcNumber, null, cancellationToken)
            .ConfigureAwait(false);

        var doctor = Doctor.Create(
            command.Name, command.NmcNumber, command.Speciality, command.Phone, command.Fee,
            DoctorMapping.ParseShareType(command.ShareType), command.ShareValue,
            timeProvider.GetUtcNow().UtcDateTime);

        dbContext.Doctors.Add(doctor);
        await DoctorWrites.SaveAsync(dbContext, cancellationToken).ConfigureAwait(false);
        return doctor.Id;
    }
}
