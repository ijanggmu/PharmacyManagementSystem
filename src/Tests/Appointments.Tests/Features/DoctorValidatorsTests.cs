using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Contracts.v1.Timetable;
using FSH.Modules.Appointments.Features.v1.Doctors.AddDoctorDayChange;
using FSH.Modules.Appointments.Features.v1.Doctors.CreateDoctor;
using FSH.Modules.Appointments.Features.v1.Doctors.SetDoctorWeeklySlots;
using FSH.Modules.Appointments.Features.v1.Timetable.GetTimetable;

namespace Appointments.Tests.Features;

public sealed class DoctorValidatorsTests
{
    private static readonly DateOnly Day = new(2026, 11, 1);

    [Theory]
    [InlineData("Percent", 80, true)]
    [InlineData("percent", 100, true)]
    [InlineData("Percent", 101, false)]
    [InlineData("Fixed", 500, true)]
    [InlineData("Fixed", 501, false)]
    [InlineData("Commission", 10, false)]
    public void Create_doctor_checks_share_against_type_and_fee(string shareType, decimal share, bool valid)
    {
        var result = new CreateDoctorCommandValidator().Validate(
            new CreateDoctorCommand("Dr. A", null, null, null, 500m, shareType, share));
        result.IsValid.ShouldBe(valid);
    }

    [Fact]
    public void Create_doctor_needs_a_name()
    {
        new CreateDoctorCommandValidator()
            .Validate(new CreateDoctorCommand(" ", null, null, null, 500m, "Percent", 50m))
            .IsValid.ShouldBeFalse();
    }

    [Fact]
    public void Weekly_slots_check_each_sitting()
    {
        var validator = new SetDoctorWeeklySlotsCommandValidator();
        var ok = new WeeklySlotInput(Guid.CreateVersion7(), 0, new TimeOnly(8, 0), new TimeOnly(10, 0), 10);

        validator.Validate(new SetDoctorWeeklySlotsCommand(Guid.CreateVersion7(), [ok])).IsValid.ShouldBeTrue();
        validator.Validate(new SetDoctorWeeklySlotsCommand(Guid.CreateVersion7(), [])).IsValid.ShouldBeTrue();
        validator.Validate(new SetDoctorWeeklySlotsCommand(Guid.CreateVersion7(), [ok with { DayOfWeek = 7 }])).IsValid.ShouldBeFalse();
        validator.Validate(new SetDoctorWeeklySlotsCommand(Guid.CreateVersion7(), [ok with { BranchId = Guid.Empty }])).IsValid.ShouldBeFalse();
        validator.Validate(new SetDoctorWeeklySlotsCommand(Guid.CreateVersion7(), [ok with { EndTime = new TimeOnly(8, 0) }])).IsValid.ShouldBeFalse();
        validator.Validate(new SetDoctorWeeklySlotsCommand(Guid.CreateVersion7(), [ok with { MaxTokens = 0 }])).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void Extra_day_needs_its_details_but_a_day_off_does_not()
    {
        var validator = new AddDoctorDayChangeCommandValidator();
        var doctorId = Guid.CreateVersion7();

        validator.Validate(new AddDoctorDayChangeCommand(doctorId, Day, "DayOff", null, null, null, null, null))
            .IsValid.ShouldBeTrue();
        validator.Validate(new AddDoctorDayChangeCommand(doctorId, Day, "ExtraDay", null, null, null, null, null))
            .IsValid.ShouldBeFalse();
        validator.Validate(new AddDoctorDayChangeCommand(
                doctorId, Day, "ExtraDay", Guid.CreateVersion7(), new TimeOnly(8, 0), new TimeOnly(10, 0), 10, null))
            .IsValid.ShouldBeTrue();
        validator.Validate(new AddDoctorDayChangeCommand(doctorId, Day, "Holiday", null, null, null, null, null))
            .IsValid.ShouldBeFalse();
    }

    [Fact]
    public void Timetable_range_is_at_most_31_days_and_in_order()
    {
        var validator = new GetTimetableQueryValidator();

        validator.Validate(new GetTimetableQuery(Day, Day.AddDays(30))).IsValid.ShouldBeTrue();
        validator.Validate(new GetTimetableQuery(Day, Day.AddDays(31))).IsValid.ShouldBeFalse();
        validator.Validate(new GetTimetableQuery(Day, Day.AddDays(-1))).IsValid.ShouldBeFalse();
    }
}
