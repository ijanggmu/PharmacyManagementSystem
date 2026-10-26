using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Appointments.Features.v1.Doctors.SetDoctorWeeklySlots;

public sealed class SetDoctorWeeklySlotsCommandHandler(AppointmentsDbContext dbContext, IBranchService branches)
    : ICommandHandler<SetDoctorWeeklySlotsCommand, Guid>
{
    public async ValueTask<Guid> Handle(SetDoctorWeeklySlotsCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await BranchChecks.EnsureActiveBranchesAsync(branches, command.Slots.Select(s => s.BranchId), cancellationToken)
            .ConfigureAwait(false);

        var doctor = await DoctorWrites.LoadAsync(dbContext, command.DoctorId, cancellationToken).ConfigureAwait(false);
        doctor.SetWeeklySlots(command.Slots
            .Select(s => new WeeklySlotSpec(s.BranchId, (DayOfWeek)s.DayOfWeek, s.StartTime, s.EndTime, s.MaxTokens))
            .ToList());

        await DoctorWrites.SaveAsync(dbContext, cancellationToken).ConfigureAwait(false);
        return doctor.Id;
    }
}
