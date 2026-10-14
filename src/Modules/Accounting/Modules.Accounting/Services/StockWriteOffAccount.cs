using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The system "Stock Write-off &amp; Expiry Loss" expense (<see cref="AccountingSystemAccountCodes.StockWriteOff"/>),
/// seeded by <c>AccountingDbInitializer</c>. A tenant whose seed has not run since it was added gets it created on first
/// use under the Expenses head, like <see cref="TdsPayableAccount"/>: saved on its own before the voucher; a concurrent
/// creation fails on the unique code and the retried event finds the account.
/// </summary>
internal static class StockWriteOffAccount
{
    public const string Name = "Stock Write-off & Expiry Loss";

    public static async ValueTask<Guid> GetOrCreateAsync(AccountingDbContext dbContext, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        const string code = AccountingSystemAccountCodes.StockWriteOff;
        var existing = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Code == code)
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
                $"Account code {code} is used by a user-created account, so the system {Name} account can't be created. " +
                "Change that account's code, then retry.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        string expenseRootCode = AccountingAccount.RootHeads[AccountingAccountType.Expense].Code;
        Guid? expenseRoot = await dbContext.Accounts
            .Where(a => a.ParentId == null && a.IsSystem && a.Code == expenseRootCode)
            .Select(a => (Guid?)a.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        var account = AccountingAccount.Create(code, Name, AccountingAccountType.Expense, isSystem: true, parentId: expenseRoot);
        dbContext.Accounts.Add(account);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return account.Id;
    }
}
