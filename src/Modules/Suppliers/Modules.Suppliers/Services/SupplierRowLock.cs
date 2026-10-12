using System.Data;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Services;

/// <summary>
/// Serializes every write to one supplier's AP account. <see cref="Supplier.CurrentBalance"/> and each new
/// ledger entry's running balance are read-modify-write, and a bill payment is checked against what is still
/// owed on the bill; two writers interleaving (two payments, a payment and a goods-receipt posting) would
/// otherwise both read the same balance and one update would be lost, or both payments would fit the same
/// outstanding amount and over-pay the bill. Every writer therefore opens a transaction, locks the supplier
/// row (<c>SELECT ... FOR UPDATE</c>), and only then reads the balance / allocates bills and applies its entry.
/// </summary>
internal static class SupplierRowLock
{
    /// <summary>
    /// Locks the supplier row (relational providers; call inside a transaction) and returns the supplier as a
    /// tracked entity carrying the committed, post-lock balance. Throws <see cref="NotFoundException"/> when
    /// it does not exist (or is soft-deleted, unless <paramref name="includeDeleted"/>).
    /// </summary>
    /// <remarks>Pass <c>includeDeleted: true</c> for postings from integration events: a document raised before
    /// the supplier was soft-deleted must still reach its AP ledger rather than dead-letter. Only the soft-delete
    /// filter is lifted; tenant isolation stays in force. User-initiated writes (payments, returns) keep the
    /// default and refuse a deleted supplier.</remarks>
    public static async Task<Supplier> LockAsync(
        SuppliersDbContext dbContext, Guid supplierId, CancellationToken cancellationToken, bool includeDeleted = false)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        if (dbContext.Database.IsRelational())
        {
            // The table is written schema-qualified (HasDefaultSchema "suppliers").
            await dbContext.Database.SqlQuery<Guid>($"""
                SELECT "Id" FROM suppliers."Suppliers" WHERE "Id" = {supplierId} FOR UPDATE
                """).ToListAsync(cancellationToken).ConfigureAwait(false);

            // A copy loaded before the lock may carry a stale balance: re-read it.
            var tracked = dbContext.ChangeTracker.Entries<Supplier>().FirstOrDefault(e => e.Entity.Id == supplierId);
            if (tracked is { State: EntityState.Unchanged })
            {
                await tracked.ReloadAsync(cancellationToken).ConfigureAwait(false);
            }
        }

        IQueryable<Supplier> suppliers = includeDeleted
            ? dbContext.Suppliers.IgnoreQueryFilters([QueryFilters.SoftDelete])
            : dbContext.Suppliers;

        return await suppliers
            .FirstOrDefaultAsync(s => s.Id == supplierId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {supplierId} not found.");
    }

    /// <summary>
    /// Runs <paramref name="work"/> in a transaction: the context's open one when there is one (its owner
    /// commits it), else a new READ COMMITTED transaction committed here. Non-relational providers run it as is.
    /// </summary>
    public static async Task<T> InTransactionAsync<T>(
        SuppliersDbContext dbContext, Func<Task<T>> work, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(work);

        if (!dbContext.Database.IsRelational() || dbContext.Database.CurrentTransaction is not null)
        {
            return await work().ConfigureAwait(false);
        }

        var strategy = dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await dbContext.Database
                .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
                .ConfigureAwait(false);
            var result = await work().ConfigureAwait(false);
            await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
            return result;
        }).ConfigureAwait(false);
    }
}
