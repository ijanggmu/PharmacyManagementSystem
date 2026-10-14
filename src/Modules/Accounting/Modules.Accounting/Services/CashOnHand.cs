using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Cash can't go below zero: a deposit to the bank, or an expense or tax payment paid in cash, may not take out more
/// than the cash account holds. Applies to the cash account only — the account the "cash" payment method posts to,
/// and the system Cash account (1000). Bank accounts are left alone: a bank account may legitimately run an overdraft,
/// and the chart has no flag to tell which ones may.
/// <para>The balance is the account's whole posted ledger for the branch (with the legacy, branch-less entries), so a
/// back-dated payment can't spend cash that was already paid out later.</para>
/// </summary>
internal static class CashOnHand
{
    public static async Task EnsureAvailableAsync(
        AccountingDbContext dbContext, IPaymentMethodAccountResolver paymentAccounts, Guid creditAccountId, Guid? branchId,
        decimal amount, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(paymentAccounts);
        if (amount <= 0m)
        {
            return;
        }

        var account = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Id == creditAccountId)
            .Select(a => new { a.Code, a.Name })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (account is null)
        {
            return;
        }

        if (account.Code != AccountingSystemAccountCodes.Cash
            && creditAccountId != await paymentAccounts.ResolveAccountIdAsync(PaymentMethodAccounts.Cash, cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        decimal balance = await BalanceAsync(dbContext, creditAccountId, branchId, cancellationToken).ConfigureAwait(false);
        if (balance - amount < 0m)
        {
            throw new CustomException(
                string.Format(
                    CultureInfo.InvariantCulture,
                    "Not enough cash: {0} {1} holds {2:N2}, so {3:N2} can't be paid out of it. Record the cash received first, or pay from the bank.",
                    account.Code, account.Name, balance, amount),
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }

    /// <summary>Debit less credit of the account's posted ledger lines for <paramref name="branchId"/> (all branches when null).</summary>
    public static Task<decimal> BalanceAsync(AccountingDbContext dbContext, Guid accountId, Guid? branchId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        return (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where line.AccountId == accountId
                && (branchId == null || voucher.BranchId == branchId || voucher.BranchId == null)
            select line.DebitAmount - line.CreditAmount)
            .SumAsync(cancellationToken);
    }
}
