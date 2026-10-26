using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Contracts.Events;
using FSH.Modules.Appointments.Contracts.v1.Appointments;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using FSH.Modules.Appointments.Contracts.v1.Payouts;
using FSH.Modules.Appointments.Contracts.v1.Timetable;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using FSH.Modules.Appointments.Features.v1.Appointments;
using FSH.Modules.Appointments.Features.v1.Doctors.AddDoctorDayChange;
using FSH.Modules.Appointments.Features.v1.Payouts;
using FSH.Modules.Appointments.Features.v1.Timetable.GetTimetable;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Appointments.Tests.Features;

/// <summary>The doctors' desk end to end on the in-memory provider: book → arrive (fee) → seen, cancelling with a
/// refund, paying the doctor, and the cash it all puts through the drawer.</summary>
public sealed class AppointmentHandlersTests : IDisposable
{
    // 06:00 UTC = 11:45 on Sunday 1 Nov in Nepal; the doctor sits Sundays 16:00–19:00.
    private static readonly DateOnly Sunday = new(2026, 11, 1);
    private static readonly TimeOnly Four = new(16, 0);

    private readonly SettableClock _clock = new(new DateTimeOffset(2026, 11, 1, 6, 0, 0, TimeSpan.Zero));
    private readonly AppointmentsDbContext _db = AppointmentsDbContextFactory.Create();
    private readonly ICurrentUser _user = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IBranchService _branches = Substitute.For<IBranchService>();
    private readonly List<IIntegrationEvent> _events = [];
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly Guid _branch = Guid.CreateVersion7();
    private Doctor _doctor = default!;

    public AppointmentHandlersTests()
    {
        _user.IsAuthenticated().Returns(true);
        _user.GetUserId().Returns(Guid.CreateVersion7());
        _user.GetTenant().Returns("test-tenant");
        _user.Name.Returns("Owner");
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.Arg<Guid?>());
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branch);
        _branches.IsActiveBranchOfCurrentTenantAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns(true);
        _outbox.AddAsync(Arg.Do<IIntegrationEvent>(_events.Add), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
    }

    public void Dispose() => _db.Dispose();

    private async Task SeedDoctorAsync(int maxTokens = 3)
    {
        _doctor = Doctor.Create("Dr. Sharma", "123", "Physician", null, 500m, DoctorShareType.Percent, 80m, DateTime.UtcNow);
        _doctor.SetWeeklySlots([new WeeklySlotSpec(_branch, DayOfWeek.Sunday, Four, new TimeOnly(19, 0), maxTokens)]);
        _db.Doctors.Add(_doctor);
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();
    }

    private Task<AppointmentDto> BookAsync(string name = "Hari", DateOnly? date = null, TimeOnly? start = null) =>
        new BookTokenCommandHandler(_db, _user, _clock)
            .Handle(new BookTokenCommand(_doctor.Id, date ?? Sunday, start ?? Four, name, "9800000000"), CancellationToken.None)
            .AsTask();

    private Task<AppointmentDto> ArriveAsync(Guid id, decimal fee = 500m, string? method = "cash") =>
        new MarkAppointmentArrivedCommandHandler(_db, _outbox, _user, _clock)
            .Handle(new MarkAppointmentArrivedCommand(id, fee, method), CancellationToken.None).AsTask();

    private Task<AppointmentDto> CancelAsync(Guid id, string reason = "Patient called") =>
        new CancelAppointmentCommandHandler(_db, _outbox, _user, _clock)
            .Handle(new CancelAppointmentCommand(id, reason), CancellationToken.None).AsTask();

    [Fact]
    public async Task Booking_hands_out_tokens_in_order_until_the_sitting_is_full()
    {
        await SeedDoctorAsync(maxTokens: 2);

        var first = await BookAsync("Hari");
        var second = await BookAsync("Sita");

        first.TokenNo.ShouldBe(1);
        second.TokenNo.ShouldBe(2);
        second.DoctorName.ShouldBe("Dr. Sharma");
        second.StartTime.ShouldBe(Four);
        second.Status.ShouldBe(AppointmentStatus.Booked.ToString());
        (await Should.ThrowAsync<CustomException>(() => BookAsync("Ram"))).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        _db.DoctorSessions.Count().ShouldBe(1);
    }

    [Fact]
    public async Task Booking_refuses_a_time_the_doctor_doesnt_sit_a_day_off_a_past_date_or_a_sitting_already_over()
    {
        await SeedDoctorAsync();

        (await Should.ThrowAsync<CustomException>(() => BookAsync(start: new TimeOnly(9, 0)))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await Should.ThrowAsync<CustomException>(() => BookAsync(date: Sunday.AddDays(-7)))).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        await new AddDoctorDayChangeCommandHandler(_db, _branches, _clock).Handle(
            new AddDoctorDayChangeCommand(_doctor.Id, Sunday.AddDays(7), DoctorDayChangeKinds.DayOff, null, null, null, null, null),
            CancellationToken.None);
        (await Should.ThrowAsync<CustomException>(() => BookAsync(date: Sunday.AddDays(7)))).StatusCode.ShouldBe(HttpStatusCode.NotFound);

        // 13:30 UTC = 19:15 in Nepal: today's 16:00–19:00 sitting is over.
        _clock.SetUtcNow(new DateTimeOffset(2026, 11, 1, 13, 30, 0, TimeSpan.Zero));
        (await Should.ThrowAsync<CustomException>(() => BookAsync())).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task A_day_off_is_refused_while_patients_hold_tokens_that_day()
    {
        await SeedDoctorAsync();
        await BookAsync();

        var ex = await Should.ThrowAsync<CustomException>(async () => await new AddDoctorDayChangeCommandHandler(_db, _branches, _clock).Handle(
            new AddDoctorDayChangeCommand(_doctor.Id, Sunday, DoctorDayChangeKinds.DayOff, null, null, null, null, null),
            CancellationToken.None));
        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Arriving_takes_the_doctors_share_of_the_fee_and_sends_the_receipt_to_accounting()
    {
        await SeedDoctorAsync();
        var booked = await BookAsync();

        var arrived = await ArriveAsync(booked.Id, fee: 400m, method: "Fonepay");

        arrived.Status.ShouldBe("Arrived");
        arrived.FeeAmount.ShouldBe(400m);
        arrived.DoctorShareAmount.ShouldBe(320m);
        arrived.PaymentMethod.ShouldBe("fonepay");
        var collected = _events.OfType<ConsultationFeeCollectedIntegrationEvent>().Single();
        collected.AppointmentId.ShouldBe(booked.Id);
        collected.Amount.ShouldBe(400m);
        collected.DoctorShare.ShouldBe(320m);
        collected.BranchId.ShouldBe(_branch);
        collected.TenantId.ShouldBe("test-tenant");
    }

    [Fact]
    public async Task A_free_visit_sends_nothing_to_accounting()
    {
        await SeedDoctorAsync();
        var booked = await BookAsync();

        await ArriveAsync(booked.Id, fee: 0m, method: null);

        _events.ShouldBeEmpty();
    }

    [Fact]
    public async Task Cancelling_frees_the_place_and_gives_a_taken_fee_back()
    {
        await SeedDoctorAsync(maxTokens: 1);
        var booked = await BookAsync();
        await ArriveAsync(booked.Id);

        var cancelled = await CancelAsync(booked.Id, "Doctor left early");

        cancelled.Status.ShouldBe("Cancelled");
        _events.OfType<ConsultationFeeRefundedIntegrationEvent>().Single().AppointmentId.ShouldBe(booked.Id);
        (await BookAsync("Next")).TokenNo.ShouldBe(2);
    }

    [Fact]
    public async Task Seen_links_the_prescription()
    {
        await SeedDoctorAsync();
        var booked = await BookAsync();
        await ArriveAsync(booked.Id);
        var prescriptionId = Guid.CreateVersion7();

        var seen = await new MarkAppointmentSeenCommandHandler(_db, _clock)
            .Handle(new MarkAppointmentSeenCommand(booked.Id, prescriptionId), CancellationToken.None);

        seen.Status.ShouldBe("Seen");
        seen.PrescriptionId.ShouldBe(prescriptionId);
    }

    [Fact]
    public async Task Paying_the_doctor_settles_what_is_owed_and_sends_the_payment_to_accounting()
    {
        await SeedDoctorAsync();
        var a = await BookAsync("A");
        var b = await BookAsync("B");
        await ArriveAsync(a.Id, 500m);
        await ArriveAsync(b.Id, 300m, "esewa");
        _db.ChangeTracker.Clear();

        var balance = await new GetDoctorBalanceQueryHandler(_db).Handle(new GetDoctorBalanceQuery(_doctor.Id), CancellationToken.None);
        balance.AmountOwed.ShouldBe(640m);
        balance.VisitCount.ShouldBe(2);
        balance.FeesCollected.ShouldBe(800m);

        var payout = await new PayDoctorCommandHandler(_db, _outbox, _user, _currentBranch, _clock)
            .Handle(new PayDoctorCommand(_doctor.Id, "cash", "Week 1"), CancellationToken.None);

        payout.Amount.ShouldBe(640m);
        payout.VisitCount.ShouldBe(2);
        payout.PaidBy.ShouldBe("Owner");
        var paid = _events.OfType<DoctorPayoutPaidIntegrationEvent>().Single();
        paid.PayoutId.ShouldBe(payout.Id);
        paid.Amount.ShouldBe(640m);
        _db.ChangeTracker.Clear();
        (await new GetDoctorBalanceQueryHandler(_db).Handle(new GetDoctorBalanceQuery(_doctor.Id), CancellationToken.None))
            .AmountOwed.ShouldBe(0m);
        (await Should.ThrowAsync<CustomException>(async () => await CancelAsync(a.Id))).StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Drawer_cash_counts_cash_fees_less_cash_refunds_and_cash_payouts_at_that_branch()
    {
        await SeedDoctorAsync(maxTokens: 10);
        var a = await BookAsync("A");
        var b = await BookAsync("B");
        var c = await BookAsync("C");
        await ArriveAsync(a.Id, 500m, "cash");
        await ArriveAsync(b.Id, 500m, "esewa");
        await ArriveAsync(c.Id, 500m, "cash");
        await CancelAsync(c.Id);
        await new PayDoctorCommandHandler(_db, _outbox, _user, _currentBranch, _clock)
            .Handle(new PayDoctorCommand(_doctor.Id, "cash"), CancellationToken.None);

        var handler = new GetAppointmentDrawerCashQueryHandler(_db);
        DateTime from = _clock.GetUtcNow().UtcDateTime.AddHours(-1);
        DateTime to = _clock.GetUtcNow().UtcDateTime.AddHours(1);

        // 500 cash in, 500 cash in and back out, 800 (two visits' share) paid out in cash.
        (await handler.Handle(new GetAppointmentDrawerCashQuery(_branch, from, to), CancellationToken.None)).ShouldBe(500m - 800m);
        (await handler.Handle(new GetAppointmentDrawerCashQuery(Guid.CreateVersion7(), from, to), CancellationToken.None)).ShouldBe(0m);
    }

    [Fact]
    public async Task Day_sheet_and_timetable_show_each_sitting_with_its_tokens()
    {
        await SeedDoctorAsync();
        await BookAsync("Hari");
        var sita = await BookAsync("Sita");
        await CancelAsync(sita.Id);
        _db.ChangeTracker.Clear();

        var sheet = await new GetDaySheetQueryHandler(_db, _currentBranch).Handle(new GetDaySheetQuery(Sunday), CancellationToken.None);
        var sitting = sheet.Sessions.Single();
        sitting.Fee.ShouldBe(500m);
        sitting.Booked.ShouldBe(1);
        sitting.Appointments.Select(a => (a.TokenNo, a.Status)).ShouldBe([(1, "Booked"), (2, "Cancelled")]);

        var timetable = await new GetTimetableQueryHandler(_db, _currentBranch)
            .Handle(new GetTimetableQuery(Sunday, Sunday.AddDays(6)), CancellationToken.None);
        timetable.Sessions.Single().Booked.ShouldBe(1);
    }

    [Fact]
    public async Task Search_finds_by_phone_and_status()
    {
        await SeedDoctorAsync();
        await BookAsync("Hari");
        var handler = new SearchAppointmentsQueryHandler(_db, _currentBranch);

        (await handler.Handle(new SearchAppointmentsQuery(Search: "98000"), CancellationToken.None)).TotalCount.ShouldBe(1);
        (await handler.Handle(new SearchAppointmentsQuery(Search: "hari", Status: "Seen"), CancellationToken.None)).TotalCount.ShouldBe(0);
    }
}
