using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Appointments.Services;

/// <summary>
/// The sittings of a date range as staff see them: the doctors' timetable (<see cref="SessionCalendar"/>) with each
/// sitting's booked count from its saved <see cref="DoctorSession"/>, plus any saved sitting that still has patients
/// but is no longer in the timetable (its weekly day was changed, or the doctor stopped, after patients booked) —
/// booked patients never drop off the screen.
/// </summary>
internal static class SittingBoard
{
    public static async Task<(TimetableDto Timetable, IReadOnlyDictionary<Guid, Doctor> Doctors, IReadOnlyList<DoctorSession> Saved)> BuildAsync(
        AppointmentsDbContext dbContext, DateOnly from, DateOnly to, Guid? branchId, Guid? doctorId, CancellationToken ct)
    {
        var doctorsQuery = dbContext.Doctors
            .AsNoTracking()
            .Include(d => d.WeeklySlots)
            .Include(d => d.DayChanges.Where(c => c.Date >= from && c.Date <= to))
            .AsSplitQuery();
        var sessionsQuery = dbContext.DoctorSessions.AsNoTracking().Where(s => s.Date >= from && s.Date <= to);
        if (doctorId is { } id)
        {
            doctorsQuery = doctorsQuery.Where(d => d.Id == id);
            sessionsQuery = sessionsQuery.Where(s => s.DoctorId == id);
        }

        if (branchId is { } branch)
        {
            sessionsQuery = sessionsQuery.Where(s => s.BranchId == branch);
        }

        var doctors = await doctorsQuery.ToListAsync(ct).ConfigureAwait(false);
        var saved = await sessionsQuery.ToListAsync(ct).ConfigureAwait(false);
        var calendar = SessionCalendar.Build(doctors, from, to, branchId);
        return (Merge(calendar, saved, doctors), doctors.ToDictionary(d => d.Id), saved);
    }

    /// <summary>Pure merge, unit-tested: calendar sittings get their saved booked count; saved sittings with patients
    /// that the calendar no longer has are added back.</summary>
    internal static TimetableDto Merge(TimetableDto calendar, IReadOnlyList<DoctorSession> saved, IReadOnlyList<Doctor> doctors)
    {
        var byKey = saved.ToDictionary(s => (s.DoctorId, s.Date, s.StartTime));
        var matched = new HashSet<Guid>();
        var sessions = new List<TimetableSessionDto>(calendar.Sessions.Count);
        foreach (var s in calendar.Sessions)
        {
            if (byKey.TryGetValue((s.DoctorId, s.Date, s.StartTime), out var session))
            {
                matched.Add(session.Id);
                sessions.Add(s with { Booked = session.BookedCount, MaxTokens = Math.Max(s.MaxTokens, session.BookedCount) });
            }
            else
            {
                sessions.Add(s);
            }
        }

        var names = doctors.ToDictionary(d => d.Id);
        foreach (var session in saved.Where(s => !matched.Contains(s.Id) && s.BookedCount > 0))
        {
            names.TryGetValue(session.DoctorId, out var doctor);
            sessions.Add(new TimetableSessionDto(
                session.DoctorId, doctor?.Name ?? "Doctor", doctor?.Speciality, session.BranchId, session.Date,
                session.StartTime, session.EndTime, session.MaxTokens, session.IsExtraDay, session.BookedCount));
        }

        return calendar with
        {
            Sessions = sessions
                .OrderBy(s => s.Date).ThenBy(s => s.StartTime).ThenBy(s => s.DoctorName, StringComparer.CurrentCulture)
                .ToList(),
        };
    }
}
