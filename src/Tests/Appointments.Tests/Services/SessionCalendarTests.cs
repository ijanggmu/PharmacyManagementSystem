using FSH.Modules.Appointments.Domain;
using FSH.Modules.Appointments.Services;

namespace Appointments.Tests.Services;

public sealed class SessionCalendarTests
{
    // 2026-11-01 is a Sunday; the week runs Sunday 1st … Saturday 7th.
    private static readonly DateOnly Sunday = new(2026, 11, 1);
    private static readonly DateOnly Saturday = Sunday.AddDays(6);
    private static readonly Guid MainBranch = Guid.CreateVersion7();
    private static readonly Guid OtherBranch = Guid.CreateVersion7();

    private static Doctor DoctorWith(string name, params WeeklySlotSpec[] slots)
    {
        var doctor = Doctor.Create(name, null, null, null, 500m, DoctorShareType.Percent, 80m, DateTime.UtcNow);
        doctor.SetWeeklySlots(slots);
        return doctor;
    }

    private static WeeklySlotSpec Slot(DayOfWeek day, int startHour, int endHour, Guid branch) =>
        new(branch, day, new TimeOnly(startHour, 0), new TimeOnly(endHour, 0), 20);

    [Fact]
    public void Weekly_sittings_repeat_on_every_matching_date()
    {
        var doctor = DoctorWith("Dr. A",
            Slot(DayOfWeek.Sunday, 16, 19, MainBranch), Slot(DayOfWeek.Wednesday, 16, 19, MainBranch));

        var timetable = SessionCalendar.Build([doctor], Sunday, Sunday.AddDays(13));

        timetable.Sessions.Select(s => s.Date).ShouldBe(
            [Sunday, Sunday.AddDays(3), Sunday.AddDays(7), Sunday.AddDays(10)]);
        timetable.Sessions.ShouldAllBe(s => s.MaxTokens == 20 && !s.IsExtraDay && s.DoctorName == "Dr. A");
        timetable.DaysOff.ShouldBeEmpty();
    }

    [Fact]
    public void Day_off_drops_that_dates_sittings_and_is_listed()
    {
        var doctor = DoctorWith("Dr. A",
            Slot(DayOfWeek.Sunday, 8, 10, MainBranch), Slot(DayOfWeek.Sunday, 16, 19, MainBranch));
        doctor.AddDayChange(Sunday, DoctorDayChangeKind.DayOff, null, null, null, null, "Wedding", Sunday);

        var timetable = SessionCalendar.Build([doctor], Sunday, Saturday);

        timetable.Sessions.ShouldBeEmpty();
        timetable.DaysOff.Count.ShouldBe(1);
        timetable.DaysOff[0].Date.ShouldBe(Sunday);
        timetable.DaysOff[0].Note.ShouldBe("Wedding");
    }

    [Fact]
    public void Day_off_on_a_date_without_sittings_is_not_listed()
    {
        var doctor = DoctorWith("Dr. A", Slot(DayOfWeek.Sunday, 16, 19, MainBranch));
        doctor.AddDayChange(Sunday.AddDays(1), DoctorDayChangeKind.DayOff, null, null, null, null, null, Sunday);

        SessionCalendar.Build([doctor], Sunday, Saturday).DaysOff.ShouldBeEmpty();
    }

    [Fact]
    public void Extra_day_adds_a_sitting()
    {
        var doctor = DoctorWith("Dr. A", Slot(DayOfWeek.Sunday, 16, 19, MainBranch));
        var friday = Sunday.AddDays(5);
        doctor.AddDayChange(
            friday, DoctorDayChangeKind.ExtraDay, OtherBranch, new TimeOnly(9, 0), new TimeOnly(11, 0), 10, null, Sunday);

        var timetable = SessionCalendar.Build([doctor], Sunday, Saturday);

        timetable.Sessions.Count.ShouldBe(2);
        var extra = timetable.Sessions.Single(s => s.IsExtraDay);
        extra.Date.ShouldBe(friday);
        extra.BranchId.ShouldBe(OtherBranch);
        extra.MaxTokens.ShouldBe(10);
        extra.StartTime.ShouldBe(new TimeOnly(9, 0));
    }

    [Fact]
    public void Branch_filter_keeps_only_that_branchs_sittings()
    {
        var doctor = DoctorWith("Dr. A",
            Slot(DayOfWeek.Sunday, 8, 10, MainBranch), Slot(DayOfWeek.Monday, 8, 10, OtherBranch));
        doctor.AddDayChange(Sunday.AddDays(7), DoctorDayChangeKind.DayOff, null, null, null, null, null, Sunday);
        doctor.AddDayChange(Sunday.AddDays(8), DoctorDayChangeKind.DayOff, null, null, null, null, null, Sunday);

        var timetable = SessionCalendar.Build([doctor], Sunday, Sunday.AddDays(13), MainBranch);

        timetable.Sessions.ShouldAllBe(s => s.BranchId == MainBranch);
        timetable.Sessions.Count.ShouldBe(1);
        timetable.DaysOff.Select(d => d.Date).ShouldBe([Sunday.AddDays(7)]); // the Monday day off is the other branch's
    }

    [Fact]
    public void Stopped_doctors_have_no_sittings()
    {
        var doctor = DoctorWith("Dr. A", Slot(DayOfWeek.Sunday, 16, 19, MainBranch));
        doctor.SetActive(false);

        SessionCalendar.Build([doctor], Sunday, Saturday).Sessions.ShouldBeEmpty();
    }

    [Fact]
    public void Sessions_are_ordered_by_date_then_time_then_doctor()
    {
        var late = DoctorWith("Dr. Z", Slot(DayOfWeek.Sunday, 8, 10, MainBranch));
        var early = DoctorWith("Dr. B", Slot(DayOfWeek.Sunday, 8, 10, MainBranch), Slot(DayOfWeek.Sunday, 6, 7, MainBranch));

        var sessions = SessionCalendar.Build([late, early], Sunday, Sunday).Sessions;

        sessions.Select(s => (s.DoctorName, s.StartTime.Hour)).ShouldBe([("Dr. B", 6), ("Dr. B", 8), ("Dr. Z", 8)]);
    }

    [Fact]
    public void NepalClock_rolls_the_date_at_18_15_utc()
    {
        NepalClock.DateOf(new DateTime(2026, 11, 1, 18, 14, 0, DateTimeKind.Utc)).ShouldBe(new DateOnly(2026, 11, 1));
        NepalClock.DateOf(new DateTime(2026, 11, 1, 18, 15, 0, DateTimeKind.Utc)).ShouldBe(new DateOnly(2026, 11, 2));
    }
}
