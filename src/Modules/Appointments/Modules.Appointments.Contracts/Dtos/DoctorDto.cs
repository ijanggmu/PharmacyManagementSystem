namespace FSH.Modules.Appointments.Contracts.Dtos;

/// <summary>How the doctor's part of the consultation fee is worked out: a percentage of the fee, or a fixed amount.</summary>
public static class DoctorShareTypes
{
    public const string Percent = "Percent";
    public const string Fixed = "Fixed";
}

/// <summary>What a day change does: the doctor is not coming that day, or comes on a day outside the weekly days.</summary>
public static class DoctorDayChangeKinds
{
    public const string DayOff = "DayOff";
    public const string ExtraDay = "ExtraDay";
}

public sealed record DoctorDto(
    Guid Id,
    string Name,
    string? NmcNumber,
    string? Speciality,
    string? Phone,
    decimal Fee,
    string ShareType,
    decimal ShareValue,
    decimal DoctorShareAmount,
    bool IsActive,
    DateTime CreatedAtUtc,
    IReadOnlyList<DoctorWeeklySlotDto> WeeklySlots,
    IReadOnlyList<DoctorDayChangeDto> DayChanges);

/// <summary>One weekly sitting: <see cref="DayOfWeek"/> is 0 = Sunday … 6 = Saturday; times are Nepal time.</summary>
public sealed record DoctorWeeklySlotDto(
    Guid Id,
    Guid BranchId,
    int DayOfWeek,
    TimeOnly StartTime,
    TimeOnly EndTime,
    int MaxTokens);

/// <summary>A one-date change to the weekly days. Times, branch and tokens are set only for an extra day.</summary>
public sealed record DoctorDayChangeDto(
    Guid Id,
    DateOnly Date,
    string Kind,
    Guid? BranchId,
    TimeOnly? StartTime,
    TimeOnly? EndTime,
    int? MaxTokens,
    string? Note);
