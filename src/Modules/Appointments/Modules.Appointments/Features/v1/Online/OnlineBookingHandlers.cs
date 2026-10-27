using System.Net;
using Finbuckle.MultiTenant.Abstractions;
using FluentValidation;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;
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

public sealed class GetAppointmentSettingsQueryHandler(AppointmentsDbContext dbContext)
    : IQueryHandler<GetAppointmentSettingsQuery, AppointmentSettingsDto>
{
    public async ValueTask<AppointmentSettingsDto> Handle(GetAppointmentSettingsQuery query, CancellationToken cancellationToken) =>
        OnlineBooking.ToDto(await OnlineBooking.LoadSettingsAsync(dbContext, track: false, cancellationToken).ConfigureAwait(false));
}

/// <summary>Saves the online-booking switch and limits; the first save creates the pharmacy's settings row.</summary>
public sealed class UpdateAppointmentSettingsCommandHandler(AppointmentsDbContext dbContext, HybridCache cache)
    : ICommandHandler<UpdateAppointmentSettingsCommand, AppointmentSettingsDto>
{
    public async ValueTask<AppointmentSettingsDto> Handle(UpdateAppointmentSettingsCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var settings = await OnlineBooking.LoadSettingsAsync(dbContext, track: true, cancellationToken).ConfigureAwait(false);
        if (dbContext.Entry(settings).State == EntityState.Detached)
        {
            dbContext.AppointmentSettings.Add(settings);
        }

        settings.Update(
            command.OnlineBookingEnabled, command.BookingDaysAhead, command.MaxBookingsPerPhonePerDay, command.ListedOnExplore);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException ex)
        {
            throw AppointmentWrites.Conflict("Someone else saved these settings at the same time. Open the page again.", ex);
        }

        // Joining or leaving the Explore page (or changing days ahead) shows there now, not after the cache expires.
        await cache.RemoveByTagAsync(ExploreCache.Tag, cancellationToken).ConfigureAwait(false);

        return OnlineBooking.ToDto(settings);
    }
}

/// <summary>
/// The public booking page: the pharmacy's name, and each active doctor's sittings from today up to the owner's
/// "days ahead" with the places left. Not found while online booking is off, so a pharmacy that never turned it on
/// shows nothing at all.
/// </summary>
public sealed class GetOnlineBookingPageQueryHandler(
    AppointmentsDbContext dbContext,
    IBranchService branches,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor,
    TimeProvider timeProvider)
    : IQueryHandler<GetOnlineBookingPageQuery, OnlineBookingPageDto>
{
    public async ValueTask<OnlineBookingPageDto> Handle(GetOnlineBookingPageQuery query, CancellationToken cancellationToken)
    {
        var settings = await OnlineBookingGuard.RequireOnAsync(dbContext, tenantAccessor, cancellationToken).ConfigureAwait(false);

        DateTime nowUtc = timeProvider.GetUtcNow().UtcDateTime;
        DateOnly today = NepalClock.DateOf(nowUtc);
        DateOnly last = OnlineBooking.LastBookableDate(today, settings.BookingDaysAhead);
        var (board, doctors, _) = await SittingBoard.BuildAsync(dbContext, today, last, null, null, cancellationToken)
            .ConfigureAwait(false);
        var calendar = SessionCalendar.Build(doctors.Values.ToList(), today, last);
        var sittings = OnlineBooking.Bookable(board, calendar, today, TimeOnly.FromDateTime(nowUtc + NepalClock.Offset));

        var branchNames = (await branches.GetAllForCurrentTenantAsync(cancellationToken).ConfigureAwait(false))
            .ToDictionary(b => b.Id, b => b.Name);
        var withSittings = sittings.Select(s => s.DoctorId).ToHashSet();

        return new OnlineBookingPageDto(
            PharmacyName: tenantAccessor.MultiTenantContext?.TenantInfo?.Name ?? "Pharmacy",
            BookingDaysAhead: settings.BookingDaysAhead,
            Doctors: doctors.Values
                .Where(d => d.IsActive && withSittings.Contains(d.Id))
                .OrderBy(d => d.Name, StringComparer.CurrentCulture)
                .Select(d => new OnlineDoctorDto(d.Id, d.Name, d.Speciality, d.Fee))
                .ToList(),
            Sittings: sittings
                .Select(s => new OnlineSittingDto(
                    s.DoctorId, s.BranchId, branchNames.GetValueOrDefault(s.BranchId), s.Date, s.StartTime, s.EndTime,
                    OnlineBooking.PlacesLeft(s)))
                .ToList());
    }
}

/// <summary>
/// A patient books a token from the public page. On top of the counter's rules (the sitting must be in the
/// timetable, not over, not full): only while online booking is on, only up to the owner's days ahead, a real
/// Nepali mobile number, and at most the owner's tokens per phone a day. Booking again in a sitting where the phone
/// already has a token shows that token instead of taking a second.
/// </summary>
public sealed class BookOnlineTokenCommandHandler(
    AppointmentsDbContext dbContext,
    IBranchService branches,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor,
    TimeProvider timeProvider)
    : ICommandHandler<BookOnlineTokenCommand, OnlineTokenDto>
{
    public async ValueTask<OnlineTokenDto> Handle(BookOnlineTokenCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var settings = await OnlineBookingGuard.RequireOnAsync(dbContext, tenantAccessor, cancellationToken).ConfigureAwait(false);

        string phone = OnlineBooking.NormalizeMobile(command.PatientPhone)
            ?? throw BadRequest("Enter a 10-digit mobile number, for example 98XXXXXXXX.");
        DateTime nowUtc = timeProvider.GetUtcNow().UtcDateTime;
        DateOnly today = NepalClock.DateOf(nowUtc);
        if (command.Date > OnlineBooking.LastBookableDate(today, settings.BookingDaysAhead))
        {
            throw BadRequest(settings.BookingDaysAhead == 0
                ? "Online booking is for today only."
                : $"Online booking is open up to {settings.BookingDaysAhead} days ahead.");
        }

        var existing = await (
                from a in dbContext.Appointments.AsNoTracking()
                join s in dbContext.DoctorSessions.AsNoTracking() on a.SessionId equals s.Id
                where a.DoctorId == command.DoctorId && a.Date == command.Date && s.StartTime == command.StartTime
                      && a.PatientPhone == phone
                      && (a.Status == AppointmentStatus.Booked || a.Status == AppointmentStatus.Arrived)
                select new { Appointment = a, Session = s })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (existing is not null)
        {
            var doctorName = await dbContext.Doctors.AsNoTracking()
                .Where(d => d.Id == command.DoctorId).Select(d => d.Name)
                .FirstAsync(cancellationToken).ConfigureAwait(false);
            return await ToDtoAsync(existing.Appointment, existing.Session, doctorName, alreadyBooked: true, cancellationToken)
                .ConfigureAwait(false);
        }

        DateTime dayStartUtc = today.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) - NepalClock.Offset;
        int bookedToday = await dbContext.Appointments.AsNoTracking()
            .CountAsync(a => a.Source == AppointmentSource.Online && a.PatientPhone == phone && a.BookedAtUtc >= dayStartUtc,
                cancellationToken)
            .ConfigureAwait(false);
        if (bookedToday >= settings.MaxBookingsPerPhonePerDay)
        {
            throw new CustomException(
                "This phone has booked as many tokens as allowed today. Call or visit the pharmacy to book more.",
                (IEnumerable<string>?)null, HttpStatusCode.TooManyRequests);
        }

        var (appointment, session, doctor) = await TokenBooking.BookAsync(
            dbContext,
            new TokenBooking.Request(
                command.DoctorId, command.Date, command.StartTime, command.PatientName.Trim(), phone, null,
                AppointmentSource.Online, null, null),
            timeProvider,
            cancellationToken).ConfigureAwait(false);
        return await ToDtoAsync(appointment, session, doctor.Name, alreadyBooked: false, cancellationToken).ConfigureAwait(false);
    }

    private async Task<OnlineTokenDto> ToDtoAsync(
        Appointment appointment, DoctorSession session, string doctorName, bool alreadyBooked, CancellationToken ct)
    {
        var branch = (await branches.GetAllForCurrentTenantAsync(ct).ConfigureAwait(false))
            .FirstOrDefault(b => b.Id == appointment.BranchId);
        return new OnlineTokenDto(
            appointment.TokenNo, doctorName, branch?.Name, appointment.Date, session.StartTime, session.EndTime,
            appointment.PatientName, alreadyBooked);
    }

    private static CustomException BadRequest(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
}

internal static class OnlineBookingGuard
{
    /// <summary>The link's code must name a real pharmacy (anonymous calls carry it in the tenant header), and its owner must have switched online booking on.</summary>
    public static async Task<AppointmentSettings> RequireOnAsync(
        AppointmentsDbContext dbContext, IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor, CancellationToken ct)
    {
        if (tenantAccessor.MultiTenantContext?.TenantInfo is null)
        {
            throw new NotFoundException("We couldn't find this pharmacy. Please check the booking link your pharmacy gave you.");
        }

        var settings = await OnlineBooking.LoadSettingsAsync(dbContext, track: false, ct).ConfigureAwait(false);
        return settings.OnlineBookingEnabled
            ? settings
            : throw new NotFoundException("This pharmacy doesn't take bookings online. Please call or visit the pharmacy.");
    }
}

public sealed class UpdateAppointmentSettingsCommandValidator : AbstractValidator<UpdateAppointmentSettingsCommand>
{
    public UpdateAppointmentSettingsCommandValidator()
    {
        RuleFor(x => x.BookingDaysAhead).InclusiveBetween(0, AppointmentSettings.MaxDaysAheadLimit);
        RuleFor(x => x.MaxBookingsPerPhonePerDay).InclusiveBetween(1, AppointmentSettings.MaxBookingsPerPhoneLimit);
    }
}

public sealed class BookOnlineTokenCommandValidator : AbstractValidator<BookOnlineTokenCommand>
{
    public BookOnlineTokenCommandValidator()
    {
        RuleFor(x => x.DoctorId).NotEmpty();
        RuleFor(x => x.Date).NotEmpty();
        RuleFor(x => x.PatientName).NotEmpty().WithMessage("Enter the patient's name.").MaximumLength(200);
        RuleFor(x => x.PatientPhone).NotEmpty().MaximumLength(32)
            .Must(p => OnlineBooking.NormalizeMobile(p) is not null)
            .WithMessage("Enter a 10-digit mobile number, for example 98XXXXXXXX.");
    }
}
