namespace FSH.Modules.Appointments.Contracts.Dtos;

/// <summary>The doctors' sittings between <see cref="From"/> and <see cref="To"/> (inclusive, Nepal dates).</summary>
public sealed record TimetableDto(
    DateOnly From,
    DateOnly To,
    IReadOnlyList<TimetableSessionDto> Sessions,
    IReadOnlyList<TimetableDayOffDto> DaysOff);

/// <summary>One sitting of one doctor on one date. <see cref="IsExtraDay"/> marks a sitting added by a day change.</summary>
public sealed record TimetableSessionDto(
    Guid DoctorId,
    string DoctorName,
    string? Speciality,
    Guid BranchId,
    DateOnly Date,
    TimeOnly StartTime,
    TimeOnly EndTime,
    int MaxTokens,
    bool IsExtraDay);

/// <summary>A date the doctor would normally sit but is not coming.</summary>
public sealed record TimetableDayOffDto(Guid DoctorId, string DoctorName, DateOnly Date, string? Note);
