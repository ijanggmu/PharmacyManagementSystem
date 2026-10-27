using System.Net;
using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Contracts.v1.Online;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using FSH.Modules.Appointments.Features.v1.Online;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using NSubstitute;

namespace Appointments.Tests.Features;

/// <summary>The public booking page: off until the owner turns it on, then the doctor's coming sittings, a token for a
/// patient, the same token again on a second tap, and the per-phone and days-ahead limits.</summary>
public sealed class OnlineBookingHandlersTests : IDisposable
{
    // 06:00 UTC = 11:45 on Sunday 1 Nov in Nepal; the doctor sits Sundays 16:00–19:00.
    private static readonly DateOnly Sunday = new(2026, 11, 1);
    private static readonly DateOnly NextSunday = new(2026, 11, 8);
    private static readonly TimeOnly Four = new(16, 0);

    private readonly SettableClock _clock = new(new DateTimeOffset(2026, 11, 1, 6, 0, 0, TimeSpan.Zero));
    private readonly AppointmentsDbContext _db = AppointmentsDbContextFactory.Create();
    private readonly IBranchService _branches = Substitute.For<IBranchService>();
    private readonly IMultiTenantContextAccessor<AppTenantInfo> _tenant = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
    private readonly Guid _branch = Guid.CreateVersion7();
    private Doctor _doctor = default!;

    public OnlineBookingHandlersTests()
    {
        _branches.GetAllForCurrentTenantAsync(Arg.Any<CancellationToken>())
            .Returns([new BranchDto { Id = _branch, Name = "Main Branch", Code = "MAIN", IsActive = true }]);
        _tenant.MultiTenantContext.Returns(
            new MultiTenantContext<AppTenantInfo>(new AppTenantInfo("test-tenant", "test-tenant", "Shree Pharmacy")));
    }

    public void Dispose() => _db.Dispose();

    private async Task SeedAsync(bool online = true, int maxTokens = 3, int perPhone = 2)
    {
        _doctor = Doctor.Create("Dr. Sharma", "123", "Physician", null, 500m, DoctorShareType.Percent, 80m, DateTime.UtcNow);
        _doctor.SetWeeklySlots([new WeeklySlotSpec(_branch, DayOfWeek.Sunday, Four, new TimeOnly(19, 0), maxTokens)]);
        _db.Doctors.Add(_doctor);
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();
        if (online)
        {
            await new UpdateAppointmentSettingsCommandHandler(_db, TestHybridCache.Create())
                .Handle(new UpdateAppointmentSettingsCommand(true, 7, perPhone), CancellationToken.None);
            _db.ChangeTracker.Clear();
        }
    }

    private Task<OnlineBookingPageDto> PageAsync() =>
        new GetOnlineBookingPageQueryHandler(_db, _branches, _tenant, _clock)
            .Handle(new GetOnlineBookingPageQuery(), CancellationToken.None).AsTask();

    private Task<OnlineTokenDto> BookAsync(string phone = "9812345678", DateOnly? date = null, string name = "Hari") =>
        new BookOnlineTokenCommandHandler(_db, _branches, _tenant, _clock)
            .Handle(new BookOnlineTokenCommand(_doctor.Id, date ?? Sunday, Four, name, phone), CancellationToken.None)
            .AsTask();

    [Fact]
    public async Task Settings_start_with_online_booking_off()
    {
        var settings = await new GetAppointmentSettingsQueryHandler(_db).Handle(new GetAppointmentSettingsQuery(), CancellationToken.None);

        settings.ShouldBe(new AppointmentSettingsDto(false, AppointmentSettings.DefaultDaysAhead, AppointmentSettings.DefaultBookingsPerPhone));
    }

    [Fact]
    public async Task The_page_and_booking_are_not_found_while_online_booking_is_off()
    {
        await SeedAsync(online: false);

        await Should.ThrowAsync<NotFoundException>(PageAsync);
        await Should.ThrowAsync<NotFoundException>(() => BookAsync());
        _db.Appointments.Count().ShouldBe(0);
    }

    [Fact]
    public async Task An_unknown_pharmacy_code_is_not_found()
    {
        await SeedAsync();
        _tenant.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(null));

        (await Should.ThrowAsync<NotFoundException>(PageAsync)).Message.ShouldContain("couldn't find this pharmacy");
        await Should.ThrowAsync<NotFoundException>(() => BookAsync());
        _db.Appointments.Count().ShouldBe(0);
    }

    [Fact]
    public async Task The_page_lists_the_doctor_and_the_sittings_up_to_the_days_ahead()
    {
        await SeedAsync(maxTokens: 3);
        await BookAsync();

        var page = await PageAsync();

        page.PharmacyName.ShouldBe("Shree Pharmacy");
        page.BookingDaysAhead.ShouldBe(7);
        page.Doctors.ShouldHaveSingleItem().ShouldBe(new OnlineDoctorDto(_doctor.Id, "Dr. Sharma", "Physician", 500m));
        page.Sittings.Select(s => (s.Date, s.PlacesLeft, s.BranchName)).ShouldBe(
            [(Sunday, 2, "Main Branch"), (NextSunday, 3, "Main Branch")]);
    }

    [Fact]
    public async Task A_sitting_that_is_over_is_not_on_the_page()
    {
        await SeedAsync();
        _clock.SetUtcNow(new DateTimeOffset(2026, 11, 1, 13, 30, 0, TimeSpan.Zero)); // 19:15 in Nepal

        var page = await PageAsync();

        page.Sittings.ShouldHaveSingleItem().Date.ShouldBe(NextSunday);
    }

    [Fact]
    public async Task A_patient_gets_the_next_token_marked_online_with_the_phone_tidied()
    {
        await SeedAsync();

        var token = await BookAsync(phone: "+977 981-234-5678", name: "  Sita  ");

        token.TokenNo.ShouldBe(1);
        token.AlreadyBooked.ShouldBeFalse();
        token.DoctorName.ShouldBe("Dr. Sharma");
        token.BranchName.ShouldBe("Main Branch");
        token.StartTime.ShouldBe(Four);
        var saved = _db.Appointments.Single();
        saved.Source.ShouldBe(AppointmentSource.Online);
        saved.PatientPhone.ShouldBe("9812345678");
        saved.PatientName.ShouldBe("Sita");
        saved.BookedByUserId.ShouldBeNull();
    }

    [Fact]
    public async Task Booking_again_in_the_same_sitting_shows_the_same_token()
    {
        await SeedAsync();
        await BookAsync(phone: "9812345678");

        var again = await BookAsync(phone: "981 234 5678");

        again.TokenNo.ShouldBe(1);
        again.AlreadyBooked.ShouldBeTrue();
        _db.Appointments.Count().ShouldBe(1);
    }

    [Fact]
    public async Task One_phone_can_take_only_the_owners_tokens_a_day()
    {
        await SeedAsync(perPhone: 1);
        await BookAsync(date: Sunday);

        var ex = await Should.ThrowAsync<CustomException>(() => BookAsync(date: NextSunday));

        ex.StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);
        (await BookAsync(phone: "9801111111", date: NextSunday)).TokenNo.ShouldBe(1);
    }

    [Fact]
    public async Task Dates_past_the_days_ahead_and_bad_phones_are_refused()
    {
        await SeedAsync();

        (await Should.ThrowAsync<CustomException>(() => BookAsync(date: new DateOnly(2026, 11, 15))))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Should.ThrowAsync<CustomException>(() => BookAsync(phone: "01-4412345")))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Saving_settings_twice_keeps_one_row()
    {
        var handler = new UpdateAppointmentSettingsCommandHandler(_db, TestHybridCache.Create());
        await handler.Handle(new UpdateAppointmentSettingsCommand(true, 7, 2), CancellationToken.None);
        _db.ChangeTracker.Clear();

        var saved = await handler.Handle(new UpdateAppointmentSettingsCommand(false, 3, 1), CancellationToken.None);

        saved.ShouldBe(new AppointmentSettingsDto(false, 3, 1));
        _db.AppointmentSettings.Count().ShouldBe(1);
    }

    [Theory]
    [InlineData(-1, 2)]
    [InlineData(61, 2)]
    [InlineData(7, 0)]
    [InlineData(7, 11)]
    public void Settings_refuse_limits_out_of_range(int daysAhead, int perPhone) =>
        Should.Throw<CustomException>(() => AppointmentSettings.Defaults().Update(true, daysAhead, perPhone))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest);

    [Fact]
    public void The_booking_validator_wants_a_name_and_a_mobile_number()
    {
        var validator = new BookOnlineTokenCommandValidator();

        validator.Validate(new BookOnlineTokenCommand(Guid.NewGuid(), Sunday, Four, "Hari", "9812345678")).IsValid.ShouldBeTrue();
        validator.Validate(new BookOnlineTokenCommand(Guid.NewGuid(), Sunday, Four, "", "9812345678")).IsValid.ShouldBeFalse();
        validator.Validate(new BookOnlineTokenCommand(Guid.NewGuid(), Sunday, Four, "Hari", "12345")).IsValid.ShouldBeFalse();
    }
}
