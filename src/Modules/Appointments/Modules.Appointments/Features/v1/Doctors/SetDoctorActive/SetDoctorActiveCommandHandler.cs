using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Data;
using Mediator;

namespace FSH.Modules.Appointments.Features.v1.Doctors.SetDoctorActive;

public sealed class SetDoctorActiveCommandHandler(AppointmentsDbContext dbContext)
    : ICommandHandler<SetDoctorActiveCommand, Guid>
{
    public async ValueTask<Guid> Handle(SetDoctorActiveCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var doctor = await DoctorWrites.LoadAsync(dbContext, command.DoctorId, cancellationToken).ConfigureAwait(false);
        doctor.SetActive(command.IsActive);
        await DoctorWrites.SaveAsync(dbContext, cancellationToken).ConfigureAwait(false);
        return doctor.Id;
    }
}
