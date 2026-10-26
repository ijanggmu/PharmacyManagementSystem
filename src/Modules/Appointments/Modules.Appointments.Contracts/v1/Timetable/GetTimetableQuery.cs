using FSH.Modules.Appointments.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Appointments.Contracts.v1.Timetable;

/// <summary>The doctors' sittings from <see cref="From"/> to <see cref="To"/> (inclusive, at most 31 days). A caller who
/// can't see every branch only gets their own branch.</summary>
public sealed record GetTimetableQuery(
    DateOnly From,
    DateOnly To,
    Guid? BranchId = null,
    Guid? DoctorId = null) : IQuery<TimetableDto>;
