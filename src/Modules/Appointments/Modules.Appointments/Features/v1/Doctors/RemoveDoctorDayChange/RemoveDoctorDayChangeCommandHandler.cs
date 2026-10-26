using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Data;
using Mediator;

namespace FSH.Modules.Appointments.Features.v1.Doctors.RemoveDoctorDayChange;

public sealed class RemoveDoctorDayChangeCommandHandler(AppointmentsDbContext dbContext)
    : ICommandHandler<RemoveDoctorDayChangeCommand, Guid>
{
    public async ValueTask<Guid> Handle(RemoveDoctorDayChangeCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var doctor = await DoctorWrites.LoadAsync(dbContext, command.DoctorId, cancellationToken).ConfigureAwait(false);
        doctor.RemoveDayChange(command.DayChangeId);
        await DoctorWrites.SaveAsync(dbContext, cancellationToken).ConfigureAwait(false);
        return command.DayChangeId;
    }
}
