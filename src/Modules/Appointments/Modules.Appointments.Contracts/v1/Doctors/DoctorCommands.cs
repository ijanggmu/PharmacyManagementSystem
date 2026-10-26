using FSH.Modules.Appointments.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Appointments.Contracts.v1.Doctors;

/// <summary>Adds a visiting doctor. <see cref="ShareType"/> is <see cref="DoctorShareTypes"/>; a percent share is 0–100,
/// a fixed share is at most the fee.</summary>
public sealed record CreateDoctorCommand(
    string Name,
    string? NmcNumber,
    string? Speciality,
    string? Phone,
    decimal Fee,
    string ShareType,
    decimal ShareValue) : ICommand<Guid>;

public sealed record UpdateDoctorCommand(
    Guid DoctorId,
    string Name,
    string? NmcNumber,
    string? Speciality,
    string? Phone,
    decimal Fee,
    string ShareType,
    decimal ShareValue) : ICommand<Guid>;

/// <summary>Stops (or restarts) a doctor: a stopped doctor keeps their history but drops out of the timetable.</summary>
public sealed record SetDoctorActiveCommand(Guid DoctorId, bool IsActive) : ICommand<Guid>;

/// <summary>Replaces the doctor's whole set of weekly days with <see cref="Slots"/> (an empty list clears them).</summary>
public sealed record SetDoctorWeeklySlotsCommand(Guid DoctorId, IReadOnlyList<WeeklySlotInput> Slots) : ICommand<Guid>;

public sealed record WeeklySlotInput(Guid BranchId, int DayOfWeek, TimeOnly StartTime, TimeOnly EndTime, int MaxTokens);

/// <summary>Adds a day change. <see cref="Kind"/> is <see cref="DoctorDayChangeKinds"/>; an extra day needs the branch,
/// times and tokens, a day off ignores them.</summary>
public sealed record AddDoctorDayChangeCommand(
    Guid DoctorId,
    DateOnly Date,
    string Kind,
    Guid? BranchId,
    TimeOnly? StartTime,
    TimeOnly? EndTime,
    int? MaxTokens,
    string? Note) : ICommand<Guid>;

public sealed record RemoveDoctorDayChangeCommand(Guid DoctorId, Guid DayChangeId) : ICommand<Guid>;
