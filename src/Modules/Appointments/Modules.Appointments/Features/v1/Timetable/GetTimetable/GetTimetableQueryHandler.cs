using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Contracts.v1.Timetable;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Appointments.Features.v1.Timetable.GetTimetable;

public sealed class GetTimetableQueryHandler(AppointmentsDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetTimetableQuery, TimetableDto>
{
    public async ValueTask<TimetableDto> Handle(GetTimetableQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken)
            .ConfigureAwait(false);

        var doctorsQuery = dbContext.Doctors
            .AsNoTracking()
            .Where(d => d.IsActive)
            .Include(d => d.WeeklySlots)
            .Include(d => d.DayChanges.Where(c => c.Date >= query.From && c.Date <= query.To))
            .AsSplitQuery();

        if (query.DoctorId is { } doctorId)
        {
            doctorsQuery = doctorsQuery.Where(d => d.Id == doctorId);
        }

        var doctors = await doctorsQuery.ToListAsync(cancellationToken).ConfigureAwait(false);
        return SessionCalendar.Build(doctors, query.From, query.To, branchId);
    }
}
