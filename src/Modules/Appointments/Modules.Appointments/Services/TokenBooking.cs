using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Appointments.Services;

/// <summary>
/// Books the next token in a doctor's sitting. The sitting must be in the doctor's timetable on that date (a day off
/// or a removed weekly day can't be booked), today or later, not already over, and within
/// <see cref="MaxDaysAhead"/>. The first booking saves the <see cref="DoctorSession"/>; a race on that insert re-reads
/// the winner. Issuing the token and inserting the appointment is one save, guarded by the session's row version: a
/// clash with another counter retries from a fresh read, up to <see cref="MaxAttempts"/> times.
/// </summary>
internal static class TokenBooking
{
    public const int MaxDaysAhead = 60;
    public const int MaxAttempts = 4;

    public sealed record Request(
        Guid DoctorId, DateOnly Date, TimeOnly StartTime, string PatientName, string? PatientPhone, Guid? CustomerId,
        AppointmentSource Source, string? Note, Guid? BookedByUserId);

    public static async Task<(Appointment Appointment, DoctorSession Session, Doctor Doctor)> BookAsync(
        AppointmentsDbContext dbContext, Request request, TimeProvider timeProvider, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(request);

        DateTime nowUtc = timeProvider.GetUtcNow().UtcDateTime;
        DateOnly today = NepalClock.DateOf(nowUtc);
        if (request.Date < today)
        {
            throw BadRequest("Pick today or a later date.");
        }

        if (request.Date > today.AddDays(MaxDaysAhead))
        {
            throw BadRequest($"Tokens can be booked up to {MaxDaysAhead} days ahead.");
        }

        var doctor = await dbContext.Doctors
            .AsNoTracking()
            .Include(d => d.WeeklySlots)
            .Include(d => d.DayChanges.Where(c => c.Date == request.Date))
            .AsSplitQuery()
            .FirstOrDefaultAsync(d => d.Id == request.DoctorId, ct)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Doctor {request.DoctorId} not found.");
        if (!doctor.IsActive)
        {
            throw BadRequest("This doctor is stopped. Start the doctor again before booking.");
        }

        var sitting = SessionCalendar.Build([doctor], request.Date, request.Date).Sessions
            .FirstOrDefault(s => s.StartTime == request.StartTime)
            ?? throw new CustomException(
                "The doctor doesn't sit at that time on that day. Check the doctor's days.",
                (IEnumerable<string>?)null, HttpStatusCode.NotFound);

        if (request.Date == today && TimeOnly.FromDateTime(nowUtc + NepalClock.Offset) >= sitting.EndTime)
        {
            throw BadRequest("This sitting is already over. Pick a later one.");
        }

        for (int attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            dbContext.ChangeTracker.Clear();
            var session = await GetOrCreateSessionAsync(dbContext, sitting, ct).ConfigureAwait(false);

            int token = session.IssueToken();
            var appointment = Appointment.Book(
                session, token, request.PatientName, request.PatientPhone, request.CustomerId, request.Source,
                request.Note, nowUtc, request.BookedByUserId);
            dbContext.Appointments.Add(appointment);
            try
            {
                await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
                return (appointment, session, doctor);
            }
            catch (DbUpdateException) when (attempt < MaxAttempts)
            {
                // Another counter took a token from this sitting first (row version, or the token-number index):
                // read the sitting again and take the next number.
            }
            catch (DbUpdateException ex)
            {
                throw AppointmentWrites.Conflict("The sitting is busy right now. Try booking again.", ex);
            }
        }

        throw AppointmentWrites.Conflict("The sitting is busy right now. Try booking again.");
    }

    private static async Task<DoctorSession> GetOrCreateSessionAsync(
        AppointmentsDbContext dbContext, Contracts.Dtos.TimetableSessionDto sitting, CancellationToken ct)
    {
        var existing = await FindAsync(dbContext, sitting, ct).ConfigureAwait(false);
        if (existing is not null)
        {
            // The owner may have changed the sitting's end time or size since its first booking.
            existing.Resize(sitting.EndTime, sitting.MaxTokens);
            return existing;
        }

        var session = DoctorSession.Create(
            sitting.DoctorId, sitting.BranchId, sitting.Date, sitting.StartTime, sitting.EndTime, sitting.MaxTokens,
            sitting.IsExtraDay);
        dbContext.DoctorSessions.Add(session);
        try
        {
            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
            return session;
        }
        catch (DbUpdateException)
        {
            // Another counter saved this sitting first: use theirs.
            dbContext.ChangeTracker.Clear();
            return await FindAsync(dbContext, sitting, ct).ConfigureAwait(false)
                ?? throw AppointmentWrites.Conflict("The sitting is busy right now. Try booking again.");
        }
    }

    private static Task<DoctorSession?> FindAsync(
        AppointmentsDbContext dbContext, Contracts.Dtos.TimetableSessionDto sitting, CancellationToken ct) =>
        dbContext.DoctorSessions.FirstOrDefaultAsync(
            s => s.DoctorId == sitting.DoctorId && s.Date == sitting.Date && s.StartTime == sitting.StartTime, ct);

    private static CustomException BadRequest(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
}
