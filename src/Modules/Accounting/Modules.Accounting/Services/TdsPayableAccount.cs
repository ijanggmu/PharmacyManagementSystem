using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The system "TDS Payable" liability (<see cref="AccountingSystemAccountCodes.TdsPayable"/>), seeded by
/// <c>AccountingDbInitializer</c>. A tenant whose seed has not run since it was added gets it created on first use,
/// under the Liabilities head — like Cash Short &amp; Over in the shift-close handler. The new account is saved on
/// its own before the voucher (posting checks its accounts against the database); a concurrent creation fails on
/// the unique code, and the retried request finds the account.
/// </summary>
internal static class TdsPayableAccount
{
    public const string Name = "TDS Payable";

    public static async ValueTask<Guid> GetOrCreateAsync(AccountingDbContext dbContext, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var existing = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Code == AccountingSystemAccountCodes.TdsPayable)
            .Select(a => new { a.Id, a.IsSystem })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (existing is { IsSystem: true })
        {
            return existing.Id;
        }

        if (existing is not null)
        {
            throw new CustomException(
                $"Account code {AccountingSystemAccountCodes.TdsPayable} is used by a user-created account, so the system {Name} account can't be created. " +
                "Change that account's code, then retry.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        string liabilityRootCode = AccountingAccount.RootHeads[AccountingAccountType.Liability].Code;
        Guid? liabilityRoot = await dbContext.Accounts
            .Where(a => a.ParentId == null && a.IsSystem && a.Code == liabilityRootCode)
            .Select(a => (Guid?)a.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        var account = AccountingAccount.Create(
            AccountingSystemAccountCodes.TdsPayable, Name, AccountingAccountType.Liability, isSystem: true, parentId: liabilityRoot);
        dbContext.Accounts.Add(account);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return account.Id;
    }

    /// <summary>
    /// TDS still owed to IRD as of <paramref name="beforeUtc"/>: TDS Payable credits − debits over every ledger
    /// voucher dated before it, tenant-wide (TDS is deposited per PAN, not per branch). Deductions raise it, a TDS
    /// deposit (Dr TDS Payable / Cr Bank) lowers it.
    /// </summary>
    public static async Task<decimal> BalanceAsOfAsync(AccountingDbContext dbContext, DateTime beforeUtc, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var accountId = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Code == AccountingSystemAccountCodes.TdsPayable && a.IsSystem)
            .Select(a => (Guid?)a.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (accountId is not { } id)
        {
            return 0m;
        }

        var totals = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where line.AccountId == id && voucher.VoucherDateUtc < beforeUtc
            select new { line.DebitAmount, line.CreditAmount })
            .GroupBy(_ => 1)
            .Select(g => new { Debit = g.Sum(x => x.DebitAmount), Credit = g.Sum(x => x.CreditAmount) })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return totals is null ? 0m : totals.Credit - totals.Debit;
    }
}
