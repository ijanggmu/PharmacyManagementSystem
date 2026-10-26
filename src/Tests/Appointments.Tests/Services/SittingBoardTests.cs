using FSH.Modules.Appointments.Domain;
using FSH.Modules.Appointments.Services;

namespace Appointments.Tests.Services;

public sealed class SittingBoardTests
{
    private static readonly DateOnly Sunday = new(2026, 11, 1);
    private static readonly Guid Branch = Guid.CreateVersion7();

    private static Doctor DoctorOnSundays(int maxTokens = 20)
    {
        var doctor = Doctor.Create("Dr. A", null, null, null, 500m, DoctorShareType.Percent, 80m, DateTime.UtcNow);
        doctor.SetWeeklySlots([new WeeklySlotSpec(Branch, DayOfWeek.Sunday, new TimeOnly(16, 0), new TimeOnly(19, 0), maxTokens)]);
        return doctor;
    }

    private static DoctorSession SavedSession(Doctor doctor, TimeOnly start, int booked, int maxTokens = 20)
    {
        var session = DoctorSession.Create(doctor.Id, Branch, Sunday, start, start.AddHours(2), maxTokens, false);
        for (int i = 0; i < booked; i++)
        {
            session.IssueToken();
        }

        return session;
    }

    [Fact]
    public void Timetable_sittings_get_their_booked_count()
    {
        var doctor = DoctorOnSundays();
        var calendar = SessionCalendar.Build([doctor], Sunday, Sunday.AddDays(6));

        var merged = SittingBoard.Merge(calendar, [SavedSession(doctor, new TimeOnly(16, 0), booked: 7)], [doctor]);

        merged.Sessions.Single().Booked.ShouldBe(7);
    }

    [Fact]
    public void A_saved_sitting_with_patients_stays_even_when_the_weekly_day_is_gone()
    {
        var doctor = DoctorOnSundays();
        var saved = SavedSession(doctor, new TimeOnly(16, 0), booked: 3);
        doctor.SetWeeklySlots([]);
        var calendar = SessionCalendar.Build([doctor], Sunday, Sunday);

        var merged = SittingBoard.Merge(calendar, [saved], [doctor]);

        var sitting = merged.Sessions.Single();
        sitting.Booked.ShouldBe(3);
        sitting.DoctorName.ShouldBe("Dr. A");
    }

    [Fact]
    public void An_empty_saved_sitting_outside_the_timetable_is_dropped()
    {
        var doctor = DoctorOnSundays();
        var saved = SavedSession(doctor, new TimeOnly(8, 0), booked: 0);
        var calendar = SessionCalendar.Build([doctor], Sunday, Sunday);

        var merged = SittingBoard.Merge(calendar, [saved], [doctor]);

        merged.Sessions.Select(s => s.StartTime).ShouldBe([new TimeOnly(16, 0)]);
    }

    [Fact]
    public void A_sitting_shrunk_below_its_bookings_shows_at_least_the_booked_count_as_size()
    {
        var doctor = DoctorOnSundays(maxTokens: 2);
        var calendar = SessionCalendar.Build([doctor], Sunday, Sunday);

        var merged = SittingBoard.Merge(calendar, [SavedSession(doctor, new TimeOnly(16, 0), booked: 5)], [doctor]);

        merged.Sessions.Single().MaxTokens.ShouldBe(5);
    }
}
