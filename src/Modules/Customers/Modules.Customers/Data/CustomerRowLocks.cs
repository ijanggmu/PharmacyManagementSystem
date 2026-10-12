using FSH.Modules.Customers.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Data;

/// <summary>
/// Row lock for read-modify-write paths on a customer's running balance or loyalty points. Same approach
/// as Sales' <c>SalesTransaction.LockSaleRowAsync</c>.
/// </summary>
internal static class CustomerRowLocks
{
    /// <summary>
    /// Locks the customer's row (<c>SELECT ... FOR UPDATE</c>) for the rest of the caller's open transaction,
    /// then reloads the tracked entity so the balance it holds is the committed, post-lock value.
    /// </summary>
    public static async Task LockAndReloadAsync(CustomersDbContext dbContext, Customer customer, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(customer);

        if (!dbContext.Database.IsRelational())
        {
            return;
        }

        // The customer was already loaded through the tenant-filtered DbSet, so the raw lock is safe.
        _ = await dbContext.Database.SqlQuery<Guid>($"""
            SELECT "Id" FROM customers."Customers" WHERE "Id" = {customer.Id} FOR UPDATE
            """).ToArrayAsync(cancellationToken).ConfigureAwait(false);

        await dbContext.Entry(customer).ReloadAsync(cancellationToken).ConfigureAwait(false);
    }
}
