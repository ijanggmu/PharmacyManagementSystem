using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using FSH.Modules.Appointments.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Appointments.Features.v1.Doctors.AddDoctorDayChange;

public sealed class AddDoctorDayChangeCommandHandler(
    AppointmentsDbContext dbContext,
    IBranchService branches,
    TimeProvider timeProvider) : ICommandHandler<AddDoctorDayChangeCommand, Guid>
{
    public async ValueTask<Guid> Handle(AddDoctorDayChangeCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var kind = DoctorMapping.ParseDayChangeKind(command.Kind);
        if (kind == DoctorDayChangeKind.ExtraDay && command.BranchId is { } branchId)
        {
            await BranchChecks.EnsureActiveBranchesAsync(branches, [branchId], cancellationToken).ConfigureAwait(false);
        }

        if (kind == DoctorDayChangeKind.DayOff)
        {
            // A day off would hide patients who already hold tokens that day: they must be cancelled (and told) first.
            int booked = await dbContext.DoctorSessions
                .Where(s => s.DoctorId == command.DoctorId && s.Date == command.Date)
                .SumAsync(s => s.BookedCount, cancellationToken)
                .ConfigureAwait(false);
            if (booked > 0)
            {
                throw AppointmentWrites.Conflict(
                    $"{booked} patient(s) have tokens with this doctor on that date. Cancel their tokens first, then mark the day off.");
            }
        }

        var doctor = await DoctorWrites.LoadAsync(dbContext, command.DoctorId, cancellationToken).ConfigureAwait(false);
        var change = doctor.AddDayChange(
            command.Date, kind, command.BranchId, command.StartTime, command.EndTime, command.MaxTokens, command.Note,
            NepalClock.Today(timeProvider));

        await DoctorWrites.SaveAsync(dbContext, cancellationToken).ConfigureAwait(false);
        return change.Id;
    }
}
