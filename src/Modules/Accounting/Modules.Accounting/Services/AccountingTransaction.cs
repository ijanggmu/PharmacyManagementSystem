using System.Data;
using FSH.Modules.Accounting.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Runs a unit of work — typically "save a document row, then post its voucher" — in one READ COMMITTED
/// transaction on the Accounting context, so a failure while posting the voucher (posting lock, an
/// unbalanced or unpostable account) can't leave the document saved without its GL entry. Joins an
/// already-open transaction instead of nesting. Non-relational providers (InMemory tests) have no
/// transactions; the work just runs.
/// </summary>
internal static class AccountingTransaction
{
    public static async ValueTask<T> RunAsync<T>(
        AccountingDbContext dbContext, Func<ValueTask<T>> work, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(work);

        if (!dbContext.Database.IsRelational() || dbContext.Database.CurrentTransaction is not null)
        {
            return await work().ConfigureAwait(false);
        }

        await using IDbContextTransaction transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        T result = await work().ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return result;
    }
}
