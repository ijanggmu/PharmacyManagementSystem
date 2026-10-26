using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Domain;

namespace FSH.Modules.Appointments.Services;

internal static class DoctorMapping
{
    public static DoctorDto ToDto(Doctor doctor)
    {
        ArgumentNullException.ThrowIfNull(doctor);
        return new DoctorDto(
            doctor.Id,
            doctor.Name,
            doctor.NmcNumber,
            doctor.Speciality,
            doctor.Phone,
            doctor.Fee,
            doctor.ShareType.ToString(),
            doctor.ShareValue,
            doctor.DoctorShareAmount(),
            doctor.IsActive,
            doctor.CreatedAtUtc,
            doctor.WeeklySlots
                .OrderBy(s => s.DayOfWeek).ThenBy(s => s.StartTime)
                .Select(s => new DoctorWeeklySlotDto(s.Id, s.BranchId, (int)s.DayOfWeek, s.StartTime, s.EndTime, s.MaxTokens))
                .ToList(),
            doctor.DayChanges
                .OrderBy(c => c.Date).ThenBy(c => c.StartTime)
                .Select(c => new DoctorDayChangeDto(
                    c.Id, c.Date, c.Kind.ToString(), c.BranchId, c.StartTime, c.EndTime, c.MaxTokens, c.Note))
                .ToList());
    }

    public static DoctorShareType ParseShareType(string shareType) =>
        Enum.Parse<DoctorShareType>(shareType, ignoreCase: true);

    public static DoctorDayChangeKind ParseDayChangeKind(string kind) =>
        Enum.Parse<DoctorDayChangeKind>(kind, ignoreCase: true);
}
