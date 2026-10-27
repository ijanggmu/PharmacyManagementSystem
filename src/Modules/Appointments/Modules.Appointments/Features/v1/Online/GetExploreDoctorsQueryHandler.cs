using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Contracts.v1.Online;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using FSH.Modules.Appointments.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace FSH.Modules.Appointments.Features.v1.Online;

/// <summary>
/// The public "Find a doctor" page. The one read in this module that crosses pharmacies, so it is kept narrow:
/// <list type="bullet">
///   <item>Only pharmacies whose owner turned on both online booking and "show on Explore", and that are active and
///   in date, are read. Every query names those tenants explicitly after ignoring the tenant filter.</item>
///   <item>Each pharmacy's sittings come from the same rules as its own booking page (<see cref="SessionCalendar"/>,
///   <see cref="SittingBoard.Merge"/>, <see cref="OnlineBooking.Bookable"/>), from today up to its own days ahead.</item>
///   <item>Only doctors with a sitting to book are listed, and nothing private leaves: no phones, NMC numbers or patients.</item>
/// </list>
/// Reads the shared database, so a pharmacy given its own connection string is not listed.
/// </summary>
public sealed class GetExploreDoctorsQueryHandler(
    AppointmentsDbContext dbContext,
    ITenantService tenants,
    IBranchService branches,
    HybridCache cache,
    TimeProvider timeProvider)
    : IQueryHandler<GetExploreDoctorsQuery, ExploreDto>
{
    public async ValueTask<ExploreDto> Handle(GetExploreDoctorsQuery query, CancellationToken cancellationToken)
    {
        DateTime nowUtc = timeProvider.GetUtcNow().UtcDateTime;
        DateOnly today = NepalClock.DateOf(nowUtc);
        string key = ExploreCache.Key(today);

        // Read-only lookup first, then build on the request's own flow (as Accounting's owner dashboard does).
        var cached = await cache.GetOrCreateAsync<ExploreDto?>(
                key, static _ => ValueTask.FromResult<ExploreDto?>(null), ExploreCache.ReadOnlyOptions,
                cancellationToken: cancellationToken)
            .ConfigureAwait(false);
        if (cached is not null)
        {
            return cached;
        }

        var explore = await BuildAsync(nowUtc, today, cancellationToken).ConfigureAwait(false);
        await cache.SetAsync(key, explore, ExploreCache.EntryOptions, [ExploreCache.Tag], cancellationToken)
            .ConfigureAwait(false);
        return explore;
    }

    private async Task<ExploreDto> BuildAsync(DateTime nowUtc, DateOnly today, CancellationToken ct)
    {
        var listed = await dbContext.AppointmentSettings
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(s => s.Key == AppointmentSettings.DefaultKey && s.OnlineBookingEnabled && s.ListedOnExplore)
            .Select(s => new { TenantId = EF.Property<string>(s, "TenantId"), s.BookingDaysAhead })
            .ToListAsync(ct)
            .ConfigureAwait(false);
        if (listed.Count == 0)
        {
            return new ExploreDto([]);
        }

        var names = await tenants.GetUsableTenantNamesAsync(listed.Select(s => s.TenantId).ToList(), ct)
            .ConfigureAwait(false);
        var daysAhead = listed
            .Where(s => names.ContainsKey(s.TenantId))
            .ToDictionary(s => s.TenantId, s => s.BookingDaysAhead);
        if (daysAhead.Count == 0)
        {
            return new ExploreDto([]);
        }

        var tenantIds = daysAhead.Keys.ToList();
        DateOnly lastDate = OnlineBooking.LastBookableDate(today, daysAhead.Values.Max());

        var owners = await dbContext.Doctors
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(d => d.IsActive && tenantIds.Contains(EF.Property<string>(d, "TenantId")))
            .Select(d => new { d.Id, TenantId = EF.Property<string>(d, "TenantId") })
            .ToListAsync(ct)
            .ConfigureAwait(false);
        if (owners.Count == 0)
        {
            return new ExploreDto([]);
        }

        var doctorIds = owners.Select(o => o.Id).ToList();
        var doctors = await dbContext.Doctors
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(d => doctorIds.Contains(d.Id))
            .Include(d => d.WeeklySlots)
            .Include(d => d.DayChanges.Where(c => c.Date >= today && c.Date <= lastDate))
            .AsSplitQuery()
            .ToListAsync(ct)
            .ConfigureAwait(false);
        var saved = await dbContext.DoctorSessions
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(s => doctorIds.Contains(s.DoctorId) && s.Date >= today && s.Date <= lastDate)
            .ToListAsync(ct)
            .ConfigureAwait(false);
        var branchById = (await branches.GetActiveForTenantsAsync(tenantIds, ct).ConfigureAwait(false))
            .ToDictionary(b => b.Id);

        var tenantOf = owners.ToDictionary(o => o.Id, o => o.TenantId);
        var nowTime = TimeOnly.FromDateTime(nowUtc + NepalClock.Offset);
        var result = new List<ExploreDoctorDto>();
        foreach (var pharmacy in doctors.GroupBy(d => tenantOf[d.Id]))
        {
            string tenantId = pharmacy.Key;
            DateOnly last = OnlineBooking.LastBookableDate(today, daysAhead[tenantId]);
            var pharmacyDoctors = pharmacy.ToList();
            var ids = pharmacyDoctors.Select(d => d.Id).ToHashSet();
            var calendar = SessionCalendar.Build(pharmacyDoctors, today, last);
            var board = SittingBoard.Merge(
                calendar, saved.Where(s => ids.Contains(s.DoctorId) && s.Date <= last).ToList(), pharmacyDoctors);

            // A sitting at a closed branch (or, defensively, another pharmacy's) has no address to show: leave it out.
            var bookable = OnlineBooking.Bookable(board, calendar, today, nowTime)
                .Where(s => branchById.TryGetValue(s.BranchId, out var branch) && branch.TenantId == tenantId)
                .ToLookup(s => s.DoctorId);

            foreach (var doctor in pharmacyDoctors.Where(d => bookable[d.Id].Any()))
            {
                result.Add(new ExploreDoctorDto(
                    tenantId,
                    names[tenantId],
                    doctor.Id,
                    doctor.Name,
                    doctor.Speciality,
                    doctor.Fee,
                    bookable[doctor.Id]
                        .Select(s => new ExploreSittingDto(
                            s.Date, s.StartTime, s.EndTime, branchById[s.BranchId].Name, branchById[s.BranchId].Address,
                            OnlineBooking.PlacesLeft(s)))
                        .ToList()));
            }
        }

        // Soonest open place first, so "who can see me soon" is at the top; doctors that are full sink to the bottom.
        return new ExploreDto(result
            .OrderBy(d => d.Sittings.FirstOrDefault(s => s.PlacesLeft > 0) is { } open
                ? open.Date.ToDateTime(open.StartTime)
                : DateTime.MaxValue)
            .ThenBy(d => d.Name, StringComparer.CurrentCulture)
            .ThenBy(d => d.PharmacyName, StringComparer.CurrentCulture)
            .ToList());
    }
}
