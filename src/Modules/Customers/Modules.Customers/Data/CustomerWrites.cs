using System.Data;
using FSH.Framework.Persistence;
using FSH.Modules.Customers.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Data;

/// <summary>
/// Concurrency discipline for writes that touch a <see cref="Customer"/> row (balance, loyalty points,
/// credit limit, profile).
///
/// <para>Every writer runs inside <see cref="ExecuteAsync{T}"/> (one READ COMMITTED transaction) and loads
/// the customer through <see cref="LockAndLoadAsync"/>, which takes <c>SELECT ... FOR UPDATE</c> on the row
/// before reading it. Two concurrent writers therefore serialize, and the second one reads the first one's
/// committed balance — so <see cref="Customer.CurrentBalance"/> and each ledger entry's
/// <see cref="CustomerLedgerEntry.RunningBalance"/> stay consistent.</para>
///
/// <para>Belt and braces: <see cref="Customer.RowVersion"/> (Postgres <c>xmin</c>) is a concurrency token, so a
/// writer that skipped the lock fails with <see cref="DbUpdateConcurrencyException"/> rather than losing an
/// update; <see cref="ExecuteAsync{T}"/> retries the whole unit of work a few times when that happens.</para>
/// </summary>
internal static class CustomerWrites
{
    private const int MaxAttempts = 3;

    /// <summary>
    /// Runs <paramref name="work"/> in its own READ COMMITTED transaction, retrying the whole unit on an
    /// optimistic-concurrency conflict. When the context already has a transaction (a caller owns the
    /// boundaries) the work just joins it and a conflict propagates to that caller.
    /// </summary>
    public static async ValueTask<T> ExecuteAsync<T>(
        CustomersDbContext dbContext,
        Func<CancellationToken, ValueTask<T>> work,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(work);

        bool relational = dbContext.Database.IsRelational();
        if (relational && dbContext.Database.CurrentTransaction is not null)
        {
            return await work(cancellationToken).ConfigureAwait(false);
        }

        int attempt = 0;
        while (true)
        {
            attempt++;
            try
            {
                if (!relational)
                {
                    // InMemory unit tests: no transactions, no row locks.
                    return await work(cancellationToken).ConfigureAwait(false);
                }

                await using var transaction = await dbContext.Database
                    .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
                    .ConfigureAwait(false);
                T result = await work(cancellationToken).ConfigureAwait(false);
                await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
                return result;
            }
            catch (DbUpdateConcurrencyException) when (attempt < MaxAttempts)
            {
                // The failed attempt rolled back (its transaction was disposed before this catch).
                // Forget its tracked state so the retry re-reads the committed row.
                dbContext.ChangeTracker.Clear();
            }
        }
    }

    /// <summary>
    /// Locks the customer's row for the rest of the current transaction and loads it tracked (post-lock
    /// values). Null when the customer is not visible to this tenant (or is soft-deleted, unless
    /// <paramref name="includeDeleted"/>). Call before anything else in the unit of work reads the
    /// customer, otherwise the change tracker hands back the earlier, pre-lock instance.
    /// </summary>
    public static async ValueTask<Customer?> LockAndLoadAsync(
        CustomersDbContext dbContext,
        Guid customerId,
        CancellationToken cancellationToken,
        bool includeDeleted = false)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        IQueryable<Customer> customers = includeDeleted
            ? dbContext.Customers.IgnoreQueryFilters([QueryFilters.SoftDelete])
            : dbContext.Customers;

        if (dbContext.Database.IsRelational())
        {
            // Tenant-filtered visibility check first, so the raw lock never touches another tenant's row.
            bool visible = await customers.AnyAsync(c => c.Id == customerId, cancellationToken).ConfigureAwait(false);
            if (!visible)
            {
                return null;
            }

            _ = await dbContext.Database.SqlQuery<Guid>($"""
                SELECT "Id" FROM customers."Customers" WHERE "Id" = {customerId} FOR UPDATE
                """).ToArrayAsync(cancellationToken).ConfigureAwait(false);
        }

        return await customers
            .FirstOrDefaultAsync(c => c.Id == customerId, cancellationToken)
            .ConfigureAwait(false);
    }
}
