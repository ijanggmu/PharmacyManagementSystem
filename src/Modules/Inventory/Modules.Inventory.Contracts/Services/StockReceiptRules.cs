using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Inventory.Contracts.Services;

/// <summary>
/// Rules every path that brings new stock in shares (manual batch, medicine create/add-stock, purchase order receipt,
/// direct goods receipt, consignment receipt), so Inventory and Purchasing refuse the same things with the same words.
/// Opening-stock imports and stock counts record what is physically there and are not held to them.
/// </summary>
public static class StockReceiptRules
{
    /// <summary>
    /// Stock whose expiry is already past can't be received: it could never be sold and would only sit on the books.
    /// <paramref name="today"/> is the pharmacy's (Nepal) calendar date; an expiry of today is still receivable.
    /// A missing expiry (stored as "no expiry") passes.
    /// </summary>
    public static void EnsureNotExpired(DateOnly? expiryDate, DateOnly today, string? what = null)
    {
        if (expiryDate is not { } expiry || expiry >= today)
        {
            return;
        }

        string subject = string.IsNullOrWhiteSpace(what) ? "This stock" : what.Trim();
        throw new CustomException(
            string.Format(
                CultureInfo.InvariantCulture,
                "{0} expired on {1:yyyy-MM-dd}. Expired stock can't be received — check the expiry date, or return the goods to the supplier.",
                subject, expiry),
            (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
    }
}
