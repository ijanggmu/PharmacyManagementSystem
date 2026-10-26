using FSH.Framework.Core.Exceptions;
using FSH.Modules.Appointments.Contracts.Dtos;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Appointments.Services;

/// <summary>Turns appointments into DTOs, loading their sittings and doctors' names in two queries.</summary>
internal static class AppointmentReads
{
    public static async Task<List<AppointmentDto>> ToDtosAsync(
        AppointmentsDbContext dbContext, IReadOnlyList<Appointment> appointments, CancellationToken ct)
    {
        var sessionIds = appointments.Select(a => a.SessionId).Distinct().ToList();
        var doctorIds = appointments.Select(a => a.DoctorId).Distinct().ToList();
        var sessions = await dbContext.DoctorSessions.AsNoTracking()
            .Where(s => sessionIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, ct)
            .ConfigureAwait(false);
        var names = await dbContext.Doctors.AsNoTracking()
            .Where(d => doctorIds.Contains(d.Id))
            .ToDictionaryAsync(d => d.Id, d => d.Name, ct)
            .ConfigureAwait(false);
        return appointments
            .Select(a => AppointmentMapping.ToDto(a, sessions[a.SessionId], names.GetValueOrDefault(a.DoctorId, "Doctor")))
            .ToList();
    }

    public static async Task<AppointmentDto> ToDtoAsync(AppointmentsDbContext dbContext, Appointment appointment, CancellationToken ct) =>
        (await ToDtosAsync(dbContext, [appointment], ct).ConfigureAwait(false))[0];

    public static async Task<Doctor> LoadDoctorAsync(AppointmentsDbContext dbContext, Guid doctorId, CancellationToken ct) =>
        await dbContext.Doctors.AsNoTracking().FirstOrDefaultAsync(d => d.Id == doctorId, ct).ConfigureAwait(false)
        ?? throw new NotFoundException($"Doctor {doctorId} not found.");
}
