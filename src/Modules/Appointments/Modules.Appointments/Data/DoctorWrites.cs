using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Appointments.Data;

/// <summary>Shared load / save steps of the doctor write handlers.</summary>
internal static class DoctorWrites
{
    /// <summary>Loads the doctor tracked, with weekly sittings and day changes, or throws 404.</summary>
    public static async Task<Doctor> LoadAsync(AppointmentsDbContext dbContext, Guid doctorId, CancellationToken ct) =>
        await dbContext.Doctors
            .Include(d => d.WeeklySlots)
            .Include(d => d.DayChanges)
            .FirstOrDefaultAsync(d => d.Id == doctorId, ct)
            .ConfigureAwait(false)
        ?? throw new NotFoundException($"Doctor {doctorId} not found.");

    /// <summary>Refuses an NMC number another doctor of this pharmacy already has (the unique index is the backstop).</summary>
    public static async Task EnsureNmcNumberFreeAsync(
        AppointmentsDbContext dbContext, string? nmcNumber, Guid? exceptDoctorId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(nmcNumber))
        {
            return;
        }

        string trimmed = nmcNumber.Trim();
        bool taken = await dbContext.Doctors
            .AnyAsync(d => d.NmcNumber == trimmed && d.Id != exceptDoctorId, ct)
            .ConfigureAwait(false);
        if (taken)
        {
            throw new CustomException(
                $"Another doctor already has NMC number {trimmed}.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }

    /// <summary>Saves, turning a concurrent edit of the same doctor into a 409 the screen can explain.</summary>
    public static async Task SaveAsync(AppointmentsDbContext dbContext, CancellationToken ct)
    {
        try
        {
            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            throw new CustomException(
                "Someone else changed this doctor at the same time. Reload the page and try again.",
                (IEnumerable<string>?)[ex.Message],
                HttpStatusCode.Conflict);
        }
    }
}
