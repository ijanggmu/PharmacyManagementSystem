using System.Data;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Appointments.Data;

/// <summary>Shared load / save / transaction steps of the appointment and payout write handlers.</summary>
internal static class AppointmentWrites
{
    public static async Task<Appointment> LoadAsync(AppointmentsDbContext dbContext, Guid appointmentId, CancellationToken ct) =>
        await dbContext.Appointments
            .FirstOrDefaultAsync(a => a.Id == appointmentId, ct)
            .ConfigureAwait(false)
        ?? throw new NotFoundException($"Appointment {appointmentId} not found.");

    /// <summary>Runs <paramref name="work"/> in one transaction, so an outbox event commits with the write it
    /// describes. Joins a transaction already open; runs as-is on the in-memory test provider.</summary>
    public static async ValueTask<T> InTransactionAsync<T>(
        AppointmentsDbContext dbContext, Func<CancellationToken, ValueTask<T>> work, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(work);

        if (!dbContext.Database.IsRelational() || dbContext.Database.CurrentTransaction is not null)
        {
            return await work(cancellationToken).ConfigureAwait(false);
        }

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);
        T result = await work(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return result;
    }

    public static CustomException Conflict(string message, Exception? inner = null) =>
        new(message, inner is null ? null : (IEnumerable<string>?)[inner.Message], HttpStatusCode.Conflict);

    /// <summary>Two people changed the same token at once.</summary>
    public static CustomException ChangedMeanwhile(Exception inner) =>
        Conflict("Someone else changed this token at the same time. Reload and try again.", inner);
}
