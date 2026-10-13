using System.Data;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Payroll.Data;
using FSH.Modules.Payroll.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Payroll.Services;

/// <summary>Write helpers shared by the run handlers.</summary>
internal static class PayrollWrites
{
    /// <summary>
    /// Runs <paramref name="work"/> in one READ COMMITTED transaction, so a status change and the integration event the
    /// outbox writes for it (which joins the ambient transaction) commit or roll back together. InMemory (unit tests) has
    /// no transactions and just runs the work.
    /// </summary>
    public static async ValueTask<T> InTransactionAsync<T>(
        PayrollDbContext dbContext, Func<CancellationToken, ValueTask<T>> work, CancellationToken cancellationToken)
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

    /// <summary>A run with its lines, tracked; 404 when missing.</summary>
    public static async ValueTask<PayrollRun> LoadRunAsync(PayrollDbContext dbContext, Guid runId, CancellationToken cancellationToken) =>
        await dbContext.Runs
            .Include(r => r.Lines)
            .FirstOrDefaultAsync(r => r.Id == runId, cancellationToken)
            .ConfigureAwait(false)
        ?? throw new NotFoundException($"Payroll run {runId} not found.");

    /// <summary>Applies a lifecycle transition, turning a refused one into a 409.</summary>
    public static void Transition(Action transition)
    {
        ArgumentNullException.ThrowIfNull(transition);
        try
        {
            transition();
        }
        catch (InvalidOperationException ex)
        {
            throw Conflict(ex.Message);
        }
    }

    public static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
}
