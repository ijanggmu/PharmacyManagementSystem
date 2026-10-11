using FSH.Modules.Purchasing.Data;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Services;

/// <summary>
/// Row locks (<c>SELECT ... FOR UPDATE</c>) that serialize state changes of one document: two concurrent
/// receives, a receive racing a cancel, or two voids of the same receipt. Call inside an open transaction
/// and load (or re-load) the entity AFTER the lock so its status is the committed one. A no-op on
/// non-relational providers (unit tests).
/// </summary>
internal static class PurchasingRowLocks
{
    public static async Task LockPurchaseOrderAsync(PurchasingDbContext dbContext, Guid purchaseOrderId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        if (!dbContext.Database.IsRelational())
        {
            return;
        }

        await dbContext.Database.SqlQuery<Guid>($"""
            SELECT "Id" FROM purchasing."PurchaseOrders" WHERE "Id" = {purchaseOrderId} FOR UPDATE
            """).ToListAsync(cancellationToken).ConfigureAwait(false);
    }

    public static async Task LockDirectGoodsReceiptAsync(PurchasingDbContext dbContext, Guid receiptId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        if (!dbContext.Database.IsRelational())
        {
            return;
        }

        await dbContext.Database.SqlQuery<Guid>($"""
            SELECT "Id" FROM purchasing."DirectGoodsReceipts" WHERE "Id" = {receiptId} FOR UPDATE
            """).ToListAsync(cancellationToken).ConfigureAwait(false);
    }
}
