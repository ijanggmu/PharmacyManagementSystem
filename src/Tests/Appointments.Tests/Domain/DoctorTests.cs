using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Appointments.Domain;

namespace Appointments.Tests.Domain;

public sealed class DoctorTests
{
    private static readonly DateOnly Today = new(2026, 11, 1); // a Sunday
    private static readonly Guid Branch = Guid.CreateVersion7();

    private static Doctor NewDoctor(decimal fee = 500m, DoctorShareType shareType = DoctorShareType.Percent, decimal share = 80m) =>
        Doctor.Create("  Dr. Sharma ", " NMC-123 ", "General physician", null, fee, shareType, share, DateTime.UtcNow);

    private static WeeklySlotSpec Slot(DayOfWeek day, int startHour, int endHour, Guid? branch = null) =>
        new(branch ?? Branch, day, new TimeOnly(startHour, 0), new TimeOnly(endHour, 0), 20);

    [Fact]
    public void Create_trims_text_and_keeps_fee_and_share()
    {
        var doctor = NewDoctor();

        doctor.Name.ShouldBe("Dr. Sharma");
        doctor.NmcNumber.ShouldBe("NMC-123");
        doctor.Phone.ShouldBeNull();
        doctor.IsActive.ShouldBeTrue();
        doctor.DoctorShareAmount().ShouldBe(400m);
    }

    [Theory]
    [InlineData(500, DoctorShareType.Percent, 70, 350)]
    [InlineData(333, DoctorShareType.Percent, 33.33, 110.99)]
    [InlineData(500, DoctorShareType.Fixed, 400, 400)]
    [InlineData(0, DoctorShareType.Percent, 100, 0)]
    public void Doctor_share_is_percent_of_fee_or_fixed_amount(decimal fee, DoctorShareType type, decimal share, decimal expected)
    {
        NewDoctor(fee, type, share).DoctorShareAmount().ShouldBe(expected);
    }

    [Theory]
    [InlineData(500, DoctorShareType.Percent, 101)]
    [InlineData(500, DoctorShareType.Fixed, 501)]
    [InlineData(-1, DoctorShareType.Fixed, 0)]
    [InlineData(500, DoctorShareType.Fixed, -5)]
    public void Share_that_does_not_fit_the_fee_is_refused(decimal fee, DoctorShareType type, decimal share)
    {
        var ex = Should.Throw<CustomException>(() => NewDoctor(fee, type, share));
        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public void SetWeeklySlots_replaces_all_sittings()
    {
        var doctor = NewDoctor();
        doctor.SetWeeklySlots([Slot(DayOfWeek.Sunday, 16, 19), Slot(DayOfWeek.Wednesday, 16, 19)]);

        doctor.SetWeeklySlots([Slot(DayOfWeek.Friday, 8, 10)]);

        doctor.WeeklySlots.Count.ShouldBe(1);
        doctor.WeeklySlots[0].DayOfWeek.ShouldBe(DayOfWeek.Friday);
        doctor.WeeklySlots[0].DoctorId.ShouldBe(doctor.Id);
    }

    [Fact]
    public void Two_sittings_on_the_same_day_may_follow_each_other_but_not_overlap()
    {
        var doctor = NewDoctor();

        doctor.SetWeeklySlots([Slot(DayOfWeek.Sunday, 8, 10), Slot(DayOfWeek.Sunday, 10, 12, Guid.CreateVersion7())]);
        doctor.WeeklySlots.Count.ShouldBe(2);

        Should.Throw<CustomException>(() =>
            doctor.SetWeeklySlots([Slot(DayOfWeek.Sunday, 8, 11), Slot(DayOfWeek.Sunday, 10, 12, Guid.CreateVersion7())]));
        doctor.WeeklySlots.Count.ShouldBe(2); // unchanged after the refused replace
    }

    [Theory]
    [InlineData(19, 16, 20)]
    [InlineData(16, 16, 20)]
    [InlineData(16, 19, 0)]
    [InlineData(16, 19, 501)]
    public void A_sitting_needs_end_after_start_and_sensible_tokens(int start, int end, int maxTokens)
    {
        var doctor = NewDoctor();
        Should.Throw<CustomException>(() => doctor.SetWeeklySlots(
            [new WeeklySlotSpec(Branch, DayOfWeek.Monday, new TimeOnly(start, 0), new TimeOnly(end, 0), maxTokens)]));
    }

    [Fact]
    public void A_sitting_needs_a_branch()
    {
        var doctor = NewDoctor();
        Should.Throw<CustomException>(() => doctor.SetWeeklySlots([Slot(DayOfWeek.Monday, 8, 10, Guid.Empty)]));
    }

    [Fact]
    public void Day_off_can_be_added_once_per_date_and_not_in_the_past()
    {
        var doctor = NewDoctor();

        doctor.AddDayChange(Today, DoctorDayChangeKind.DayOff, null, null, null, null, " On leave ", Today)
            .Note.ShouldBe("On leave");

        Should.Throw<CustomException>(() =>
            doctor.AddDayChange(Today, DoctorDayChangeKind.DayOff, null, null, null, null, null, Today));
        Should.Throw<CustomException>(() =>
            doctor.AddDayChange(Today.AddDays(-1), DoctorDayChangeKind.DayOff, null, null, null, null, null, Today));
    }

    [Fact]
    public void Day_off_ignores_branch_and_times()
    {
        var doctor = NewDoctor();
        var change = doctor.AddDayChange(
            Today, DoctorDayChangeKind.DayOff, Branch, new TimeOnly(8, 0), new TimeOnly(9, 0), 5, null, Today);

        change.BranchId.ShouldBeNull();
        change.StartTime.ShouldBeNull();
        change.MaxTokens.ShouldBeNull();
    }

    [Fact]
    public void Extra_day_needs_branch_times_and_tokens()
    {
        var doctor = NewDoctor();
        Should.Throw<CustomException>(() => doctor.AddDayChange(
            Today, DoctorDayChangeKind.ExtraDay, null, new TimeOnly(8, 0), new TimeOnly(9, 0), 5, null, Today));
        Should.Throw<CustomException>(() => doctor.AddDayChange(
            Today, DoctorDayChangeKind.ExtraDay, Branch, new TimeOnly(8, 0), null, 5, null, Today));
    }

    [Fact]
    public void Extra_day_may_not_overlap_a_weekly_sitting_that_date()
    {
        var doctor = NewDoctor();
        doctor.SetWeeklySlots([Slot(Today.DayOfWeek, 16, 19)]);

        Should.Throw<CustomException>(() => doctor.AddDayChange(
            Today, DoctorDayChangeKind.ExtraDay, Branch, new TimeOnly(18, 0), new TimeOnly(20, 0), 5, null, Today));

        doctor.AddDayChange(
            Today, DoctorDayChangeKind.ExtraDay, Branch, new TimeOnly(8, 0), new TimeOnly(10, 0), 5, null, Today);
        doctor.DayChanges.Count.ShouldBe(1);
    }

    [Fact]
    public void A_date_cannot_be_both_a_day_off_and_an_extra_day()
    {
        var doctor = NewDoctor();
        doctor.AddDayChange(Today, DoctorDayChangeKind.DayOff, null, null, null, null, null, Today);
        Should.Throw<CustomException>(() => doctor.AddDayChange(
            Today, DoctorDayChangeKind.ExtraDay, Branch, new TimeOnly(8, 0), new TimeOnly(10, 0), 5, null, Today));

        var tomorrow = Today.AddDays(1);
        doctor.AddDayChange(
            tomorrow, DoctorDayChangeKind.ExtraDay, Branch, new TimeOnly(8, 0), new TimeOnly(10, 0), 5, null, Today);
        Should.Throw<CustomException>(() =>
            doctor.AddDayChange(tomorrow, DoctorDayChangeKind.DayOff, null, null, null, null, null, Today));
    }

    [Fact]
    public void RemoveDayChange_removes_it_or_throws_not_found()
    {
        var doctor = NewDoctor();
        var change = doctor.AddDayChange(Today, DoctorDayChangeKind.DayOff, null, null, null, null, null, Today);

        doctor.RemoveDayChange(change.Id);

        doctor.DayChanges.ShouldBeEmpty();
        Should.Throw<NotFoundException>(() => doctor.RemoveDayChange(change.Id));
    }
}
