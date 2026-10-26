using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Contracts.v1.Timetable;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Features.v1.Doctors.AddDoctorDayChange;
using FSH.Modules.Appointments.Features.v1.Doctors.CreateDoctor;
using FSH.Modules.Appointments.Features.v1.Doctors.GetDoctorById;
using FSH.Modules.Appointments.Features.v1.Doctors.SearchDoctors;
using FSH.Modules.Appointments.Features.v1.Doctors.SetDoctorActive;
using FSH.Modules.Appointments.Features.v1.Doctors.SetDoctorWeeklySlots;
using FSH.Modules.Appointments.Features.v1.Doctors.UpdateDoctor;
using FSH.Modules.Appointments.Features.v1.Timetable.GetTimetable;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Appointments.Tests.Features;

public sealed class DoctorHandlersTests : IDisposable
{
    // 2026-11-01 06:00 UTC = 11:45 on Sunday 1 Nov in Nepal.
    private static readonly DateOnly Sunday = new(2026, 11, 1);
    private readonly SettableClock _clock = new(new DateTimeOffset(2026, 11, 1, 6, 0, 0, TimeSpan.Zero));
    private readonly AppointmentsDbContext _db = AppointmentsDbContextFactory.Create();
    private readonly IBranchService _branches = Substitute.For<IBranchService>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly Guid _mainBranch = Guid.CreateVersion7();
    private readonly Guid _otherBranch = Guid.CreateVersion7();

    public DoctorHandlersTests()
    {
        _branches.IsActiveBranchOfCurrentTenantAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.Arg<Guid>() == _mainBranch || ci.Arg<Guid>() == _otherBranch);
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>())
            .Returns(ci => ci.Arg<Guid?>());
    }

    public void Dispose() => _db.Dispose();

    private async Task<Guid> CreateAsync(string name = "Dr. Sharma", string? nmc = "1234") =>
        await new CreateDoctorCommandHandler(_db, _clock).Handle(
            new CreateDoctorCommand(name, nmc, "Physician", "9800000000", 500m, DoctorShareTypes.Percent, 80m),
            CancellationToken.None);

    private async Task SetSlotsAsync(Guid doctorId, params WeeklySlotInput[] slots) =>
        await new SetDoctorWeeklySlotsCommandHandler(_db, _branches).Handle(
            new SetDoctorWeeklySlotsCommand(doctorId, slots), CancellationToken.None);

    private async Task<DoctorDto> GetAsync(Guid doctorId)
    {
        _db.ChangeTracker.Clear();
        return await new GetDoctorByIdQueryHandler(_db).Handle(new GetDoctorByIdQuery(doctorId), CancellationToken.None);
    }

    [Fact]
    public async Task Create_then_get_returns_the_doctor_with_share_amount()
    {
        var id = await CreateAsync();

        var dto = await GetAsync(id);

        dto.Name.ShouldBe("Dr. Sharma");
        dto.ShareType.ShouldBe(DoctorShareTypes.Percent);
        dto.DoctorShareAmount.ShouldBe(400m);
        dto.CreatedAtUtc.ShouldBe(_clock.GetUtcNow().UtcDateTime);
        dto.WeeklySlots.ShouldBeEmpty();
    }

    [Fact]
    public async Task Share_type_is_read_case_insensitively()
    {
        var id = await new CreateDoctorCommandHandler(_db, _clock).Handle(
            new CreateDoctorCommand("Dr. K", null, null, null, 300m, "fixed", 200m), CancellationToken.None);

        (await GetAsync(id)).DoctorShareAmount.ShouldBe(200m);
    }

    [Fact]
    public async Task A_second_doctor_with_the_same_NMC_number_is_refused()
    {
        await CreateAsync(nmc: "1234");

        var ex = await Should.ThrowAsync<CustomException>(() => CreateAsync("Dr. Other", " 1234 "));
        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);

        await CreateAsync("Dr. No Number", nmc: null);
        await CreateAsync("Dr. Also No Number", nmc: "  ");
    }

    [Fact]
    public async Task Update_may_keep_its_own_NMC_number_but_not_take_anothers()
    {
        var first = await CreateAsync("Dr. A", "111");
        var second = await CreateAsync("Dr. B", "222");
        var handler = new UpdateDoctorCommandHandler(_db);

        await handler.Handle(new UpdateDoctorCommand(first, "Dr. A2", "111", null, null, 600m, "Fixed", 450m), CancellationToken.None);
        (await GetAsync(first)).Name.ShouldBe("Dr. A2");

        var ex = await Should.ThrowAsync<CustomException>(async () =>
            await handler.Handle(new UpdateDoctorCommand(second, "Dr. B", "111", null, null, 600m, "Fixed", 450m), CancellationToken.None));
        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Weekly_slots_are_saved_and_replaced()
    {
        var id = await CreateAsync();

        await SetSlotsAsync(id,
            new WeeklySlotInput(_mainBranch, 0, new TimeOnly(16, 0), new TimeOnly(19, 0), 20),
            new WeeklySlotInput(_mainBranch, 3, new TimeOnly(16, 0), new TimeOnly(19, 0), 20));
        (await GetAsync(id)).WeeklySlots.Select(s => s.DayOfWeek).ShouldBe([0, 3]);

        await SetSlotsAsync(id, new WeeklySlotInput(_otherBranch, 5, new TimeOnly(8, 0), new TimeOnly(10, 0), 10));
        var slots = (await GetAsync(id)).WeeklySlots;
        slots.Count.ShouldBe(1);
        slots[0].BranchId.ShouldBe(_otherBranch);
    }

    [Fact]
    public async Task A_sitting_at_a_branch_outside_this_pharmacy_is_refused()
    {
        var id = await CreateAsync();

        var ex = await Should.ThrowAsync<CustomException>(() => SetSlotsAsync(id,
            new WeeklySlotInput(Guid.CreateVersion7(), 0, new TimeOnly(16, 0), new TimeOnly(19, 0), 20)));
        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Day_change_uses_the_Nepal_date_as_today()
    {
        var id = await CreateAsync();
        var handler = new AddDoctorDayChangeCommandHandler(_db, _branches, _clock);

        // 19:00 UTC on 1 Nov is already 2 Nov in Nepal: 1 Nov is in the past.
        _clock.SetUtcNow(new DateTimeOffset(2026, 11, 1, 19, 0, 0, TimeSpan.Zero));
        await Should.ThrowAsync<CustomException>(async () => await handler.Handle(
            new AddDoctorDayChangeCommand(id, Sunday, DoctorDayChangeKinds.DayOff, null, null, null, null, null),
            CancellationToken.None));

        await handler.Handle(
            new AddDoctorDayChangeCommand(id, Sunday.AddDays(1), "dayoff", null, null, null, null, "Leave"),
            CancellationToken.None);
        (await GetAsync(id)).DayChanges.Single().Kind.ShouldBe(DoctorDayChangeKinds.DayOff);
    }

    [Fact]
    public async Task Timetable_lists_active_doctors_sittings_and_honours_the_branch_filter()
    {
        var a = await CreateAsync("Dr. A", "1");
        var b = await CreateAsync("Dr. B", "2");
        var stopped = await CreateAsync("Dr. Stopped", "3");
        await SetSlotsAsync(a, new WeeklySlotInput(_mainBranch, 0, new TimeOnly(16, 0), new TimeOnly(19, 0), 20));
        await SetSlotsAsync(b, new WeeklySlotInput(_otherBranch, 1, new TimeOnly(8, 0), new TimeOnly(10, 0), 15));
        await SetSlotsAsync(stopped, new WeeklySlotInput(_mainBranch, 2, new TimeOnly(8, 0), new TimeOnly(10, 0), 15));
        await new SetDoctorActiveCommandHandler(_db).Handle(new SetDoctorActiveCommand(stopped, false), CancellationToken.None);
        _db.ChangeTracker.Clear();

        var handler = new GetTimetableQueryHandler(_db, _currentBranch);
        var all = await handler.Handle(new GetTimetableQuery(Sunday, Sunday.AddDays(6)), CancellationToken.None);
        all.Sessions.Select(s => s.DoctorName).ShouldBe(["Dr. A", "Dr. B"]);

        var main = await handler.Handle(new GetTimetableQuery(Sunday, Sunday.AddDays(6), _mainBranch), CancellationToken.None);
        main.Sessions.Select(s => s.DoctorName).ShouldBe(["Dr. A"]);
    }

    [Fact]
    public async Task Search_hides_stopped_doctors_unless_asked_and_matches_name_or_speciality()
    {
        await CreateAsync("Dr. Sharma", "1");
        var stopped = await CreateAsync("Dr. Thapa", "2");
        await new SetDoctorActiveCommandHandler(_db).Handle(new SetDoctorActiveCommand(stopped, false), CancellationToken.None);
        _db.ChangeTracker.Clear();
        var handler = new SearchDoctorsQueryHandler(_db);

        (await handler.Handle(new SearchDoctorsQuery(), CancellationToken.None)).Items.Select(d => d.Name)
            .ShouldBe(["Dr. Sharma"]);
        (await handler.Handle(new SearchDoctorsQuery(IncludeInactive: true), CancellationToken.None)).TotalCount
            .ShouldBe(2);
        (await handler.Handle(new SearchDoctorsQuery("physic"), CancellationToken.None)).TotalCount.ShouldBe(1);
        (await handler.Handle(new SearchDoctorsQuery("nobody"), CancellationToken.None)).TotalCount.ShouldBe(0);
    }
}
