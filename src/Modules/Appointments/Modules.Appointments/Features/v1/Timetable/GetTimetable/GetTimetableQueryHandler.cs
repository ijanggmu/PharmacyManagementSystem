using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Contracts.v1.Timetable;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Appointments.Features.v1.Timetable.GetTimetable;

/// <summary>The doctors' sittings with how many tokens each has booked (<see cref="SittingBoard"/>).</summary>
public sealed class GetTimetableQueryHandler(AppointmentsDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetTimetableQuery, TimetableDto>
{
    public async ValueTask<TimetableDto> Handle(GetTimetableQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken)
            .ConfigureAwait(false);
        var (timetable, _, _) = await SittingBoard
            .BuildAsync(dbContext, query.From, query.To, branchId, query.DoctorId, cancellationToken)
            .ConfigureAwait(false);
        return timetable;
    }
}
