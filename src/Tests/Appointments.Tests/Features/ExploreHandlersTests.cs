using System.Text.Json;
using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Contracts.v1.Online;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using FSH.Modules.Appointments.Features.v1.Online;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using Microsoft.Extensions.Caching.Hybrid;
using NSubstitute;

namespace Appointments.Tests.Features;

/// <summary>The public Explore page reads across pharmacies, so these pin who is listed (both switches on, pharmacy
/// usable, doctor active, a branch to show) and that the sittings follow each pharmacy's own booking rules.</summary>
public sealed class ExploreHandlersTests : IDisposable
{
    // 06:00 UTC = 11:45 on Sunday 1 Nov in Nepal; the doctors sit Sundays 16:00–19:00.
    private static readonly DateOnly Sunday = new(2026, 11, 1);
    private static readonly DateOnly NextSunday = new(2026, 11, 8);
    private static readonly TimeOnly Four = new(16, 0);

    private readonly string _database = Guid.NewGuid().ToString();
    private readonly SettableClock _clock = new(new DateTimeOffset(2026, 11, 1, 6, 0, 0, TimeSpan.Zero));
    private readonly HybridCache _cache = TestHybridCache.Create();
    private readonly ITenantService _tenants = Substitute.For<ITenantService>();
    private readonly IBranchService _branches = Substitute.For<IBranchService>();
    private readonly List<BranchDto> _activeBranches = [];
    private readonly Dictionary<string, string> _usable = [];
    private readonly List<AppointmentsDbContext> _contexts = [];

    public ExploreHandlersTests()
    {
        _tenants.GetUsableTenantNamesAsync(Arg.Any<IReadOnlyCollection<string>>(), Arg.Any<CancellationToken>())
            .Returns(c => _usable
                .Where(t => c.Arg<IReadOnlyCollection<string>>().Contains(t.Key))
                .ToDictionary(t => t.Key, t => t.Value));
        _branches.GetActiveForTenantsAsync(Arg.Any<IReadOnlyCollection<string>>(), Arg.Any<CancellationToken>())
            .Returns(c => _activeBranches.Where(b => c.Arg<IReadOnlyCollection<string>>().Contains(b.TenantId)).ToList());
    }

    public void Dispose()
    {
        foreach (var context in _contexts)
        {
            context.Dispose();
        }
    }

    private AppointmentsDbContext As(string pharmacy)
    {
        var context = AppointmentsDbContextFactory.Create(_database, pharmacy);
        _contexts.Add(context);
        return context;
    }

    /// <summary>A pharmacy with one Sunday doctor at one branch, its settings saved as the owner would.</summary>
    private async Task<Doctor> PharmacyAsync(
        string code, bool online = true, bool listed = true, bool usable = true, bool doctorActive = true,
        bool branchOpen = true, int daysAhead = 7)
    {
        var branch = Guid.CreateVersion7();
        if (branchOpen)
        {
            _activeBranches.Add(new BranchDto { Id = branch, TenantId = code, Name = $"{code} Main", Address = $"{code} Road", IsActive = true });
        }

        if (usable)
        {
            _usable[code] = $"Pharmacy {code}";
        }

        var db = As(code);
        var doctor = Doctor.Create($"Dr. {code}", "NMC-4455", "Physician", "9841000000", 500m, DoctorShareType.Percent, 80m, DateTime.UtcNow);
        doctor.SetWeeklySlots([new WeeklySlotSpec(branch, DayOfWeek.Sunday, Four, new TimeOnly(19, 0), 3)]);
        if (!doctorActive)
        {
            doctor.SetActive(false);
        }

        db.Doctors.Add(doctor);
        await db.SaveChangesAsync();
        await new UpdateAppointmentSettingsCommandHandler(db, _cache)
            .Handle(new UpdateAppointmentSettingsCommand(online, daysAhead, 2, listed), CancellationToken.None);
        return doctor;
    }

    private Task<ExploreDto> ExploreAsync() =>
        new GetExploreDoctorsQueryHandler(As("root"), _tenants, _branches, _cache, _clock)
            .Handle(new GetExploreDoctorsQuery(), CancellationToken.None).AsTask();

    [Fact]
    public async Task Lists_only_pharmacies_with_both_switches_on_that_are_usable()
    {
        await PharmacyAsync("listed");
        await PharmacyAsync("link-only", listed: false);
        await PharmacyAsync("expired", usable: false);
        await PharmacyAsync("stopped-doctor", doctorActive: false);
        await PharmacyAsync("closed-branch", branchOpen: false);

        var explore = await ExploreAsync();

        var doctor = explore.Doctors.ShouldHaveSingleItem();
        doctor.PharmacyCode.ShouldBe("listed");
        doctor.PharmacyName.ShouldBe("Pharmacy listed");
        doctor.Name.ShouldBe("Dr. listed");
        doctor.Fee.ShouldBe(500m);
        doctor.Sittings.Select(s => (s.Date, s.StartTime, s.BranchName, s.BranchAddress, s.PlacesLeft)).ShouldBe(
        [
            (Sunday, Four, "listed Main", "listed Road", 3),
            (NextSunday, Four, "listed Main", "listed Road", 3),
        ]);
    }

    [Fact]
    public async Task Turning_online_booking_off_also_takes_the_pharmacy_off_the_list()
    {
        var settings = AppointmentSettings.Defaults();
        settings.Update(onlineBookingEnabled: false, 7, 2, listedOnExplore: true);
        settings.ListedOnExplore.ShouldBeFalse();

        await PharmacyAsync("off", online: false, listed: true);

        (await ExploreAsync()).Doctors.ShouldBeEmpty();
    }

    [Fact]
    public async Task Each_pharmacy_keeps_its_own_days_ahead_and_booked_places()
    {
        var near = await PharmacyAsync("near", daysAhead: 0);
        await PharmacyAsync("far", daysAhead: 7);
        await new BookOnlineTokenCommandHandler(As("near"), _branches, NearTenant(), _clock)
            .Handle(new BookOnlineTokenCommand(near.Id, Sunday, Four, "Hari", "9812345678"), CancellationToken.None);
        await _cache.RemoveByTagAsync("appointments:explore");

        var explore = await ExploreAsync();

        explore.Doctors.Single(d => d.PharmacyCode == "near").Sittings
            .Select(s => (s.Date, s.PlacesLeft)).ShouldBe([(Sunday, 2)]);
        explore.Doctors.Single(d => d.PharmacyCode == "far").Sittings
            .Select(s => s.Date).ShouldBe([Sunday, NextSunday]);
    }

    [Fact]
    public async Task A_sitting_that_is_over_is_not_listed()
    {
        await PharmacyAsync("late", daysAhead: 0);
        _clock.SetUtcNow(new DateTimeOffset(2026, 11, 1, 13, 30, 0, TimeSpan.Zero)); // 19:15 in Nepal

        (await ExploreAsync()).Doctors.ShouldBeEmpty();
    }

    [Fact]
    public async Task Saving_settings_shows_on_the_page_straight_away()
    {
        await PharmacyAsync("quick");
        (await ExploreAsync()).Doctors.ShouldHaveSingleItem();

        await new UpdateAppointmentSettingsCommandHandler(As("quick"), _cache)
            .Handle(new UpdateAppointmentSettingsCommand(true, 7, 2, ListedOnExplore: false), CancellationToken.None);

        (await ExploreAsync()).Doctors.ShouldBeEmpty();
    }

    [Fact]
    public async Task Nothing_private_leaves_the_api()
    {
        await PharmacyAsync("private");

        string json = JsonSerializer.Serialize(await ExploreAsync());

        json.ShouldNotContain("NMC-4455");
        json.ShouldNotContain("9841000000");
    }

    [Fact]
    public async Task No_listed_pharmacy_gives_an_empty_page()
    {
        await PharmacyAsync("hidden", listed: false);

        (await ExploreAsync()).Doctors.ShouldBeEmpty();
        await _tenants.DidNotReceiveWithAnyArgs().GetUsableTenantNamesAsync(default!, default);
    }

    private static IMultiTenantContextAccessor<AppTenantInfo> NearTenant()
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(
            new MultiTenantContext<AppTenantInfo>(new AppTenantInfo("near", "near", "Pharmacy near")));
        return accessor;
    }
}
