using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Domain;

namespace FSH.Modules.Appointments.Services;

/// <summary>
/// Turns doctors' weekly sittings and day changes into the dated sittings of a date range. Pure: the timetable and
/// (later) booking both read sittings from here, so a day off or an extra day means the same thing everywhere.
/// <list type="bullet">
///   <item>A weekly sitting happens on every date whose weekday matches, unless that date is a day off.</item>
///   <item>An extra day adds one sitting on its date.</item>
///   <item>Stopped doctors have no sittings.</item>
///   <item>With a branch filter, only sittings at that branch (days off are listed when the doctor has a weekly
///   sitting at that branch that weekday).</item>
/// </list>
/// </summary>
internal static class SessionCalendar
{
    public const int MaxRangeDays = 31;

    public static TimetableDto Build(IReadOnlyList<Doctor> doctors, DateOnly from, DateOnly to, Guid? branchId = null)
    {
        ArgumentNullException.ThrowIfNull(doctors);

        var sessions = new List<TimetableSessionDto>();
        var daysOff = new List<TimetableDayOffDto>();

        foreach (var doctor in doctors.Where(d => d.IsActive))
        {
            var changesByDate = doctor.DayChanges
                .Where(c => c.Date >= from && c.Date <= to)
                .ToLookup(c => c.Date);

            for (var date = from; date <= to; date = date.AddDays(1))
            {
                var changes = changesByDate[date].ToList();
                var weekly = doctor.WeeklySlots
                    .Where(s => s.DayOfWeek == date.DayOfWeek && (branchId is null || s.BranchId == branchId))
                    .ToList();

                var dayOff = changes.Find(c => c.Kind == DoctorDayChangeKind.DayOff);
                if (dayOff is not null)
                {
                    if (weekly.Count > 0)
                    {
                        daysOff.Add(new TimetableDayOffDto(doctor.Id, doctor.Name, date, dayOff.Note));
                    }

                    continue;
                }

                sessions.AddRange(weekly.Select(s => new TimetableSessionDto(
                    doctor.Id, doctor.Name, doctor.Speciality, s.BranchId, date, s.StartTime, s.EndTime, s.MaxTokens,
                    IsExtraDay: false)));

                sessions.AddRange(changes
                    .Where(c => c.Kind == DoctorDayChangeKind.ExtraDay && (branchId is null || c.BranchId == branchId))
                    .Select(c => new TimetableSessionDto(
                        doctor.Id, doctor.Name, doctor.Speciality, c.BranchId!.Value, date, c.StartTime!.Value,
                        c.EndTime!.Value, c.MaxTokens!.Value, IsExtraDay: true)));
            }
        }

        return new TimetableDto(
            from,
            to,
            sessions.OrderBy(s => s.Date).ThenBy(s => s.StartTime).ThenBy(s => s.DoctorName, StringComparer.CurrentCulture).ToList(),
            daysOff.OrderBy(d => d.Date).ThenBy(d => d.DoctorName, StringComparer.CurrentCulture).ToList());
    }
}
