using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using FSH.Modules.Appointments.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

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

        var doctor = await DoctorWrites.LoadAsync(dbContext, command.DoctorId, cancellationToken).ConfigureAwait(false);
        var change = doctor.AddDayChange(
            command.Date, kind, command.BranchId, command.StartTime, command.EndTime, command.MaxTokens, command.Note,
            NepalClock.Today(timeProvider));

        await DoctorWrites.SaveAsync(dbContext, cancellationToken).ConfigureAwait(false);
        return change.Id;
    }
}
