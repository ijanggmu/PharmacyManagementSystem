using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Keeps the generic Reverse/Void voucher endpoints off opening-balance vouchers: those are changed only
/// through Opening balances (Edit/Reset), which reverses them and records the reason in the history.
/// Reversing one directly would leave the history pointing at a voucher that no longer counts.
/// </summary>
public static class OpeningBalanceVoucherGuard
{
    public static async Task EnsureNotOpeningBalanceAsync(
        AccountingDbContext dbContext, Guid voucherId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        bool isOpening = await dbContext.Vouchers.AsNoTracking()
            .AnyAsync(v => v.Id == voucherId && v.ReferenceType == OpeningBalanceRules.ReferenceType, cancellationToken)
            .ConfigureAwait(false);
        if (isOpening)
        {
            throw new CustomException(
                "This is an opening-balance voucher. Change it from Finance setup > Opening balances (Edit or Reset), so the change and its reason are recorded.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
