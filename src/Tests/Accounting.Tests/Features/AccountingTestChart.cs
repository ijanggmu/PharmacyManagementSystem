using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace Accounting.Tests.Features;

/// <summary>Seeds chart-of-accounts trees for handler tests: root heads plus accounts beneath them.</summary>
internal static class AccountingTestChart
{
    public static async Task<AccountingAccount> RootAsync(AccountingDbContext db, AccountingAccountType type)
    {
        var (code, _) = AccountingAccount.RootHeads[type];
        var existing = await db.Accounts.FirstOrDefaultAsync(a => a.Code == code);
        if (existing is not null)
        {
            return existing;
        }

        var root = AccountingAccount.CreateRootHead(type);
        db.Accounts.Add(root);
        await db.SaveChangesAsync();
        return root;
    }

    public static async Task<AccountingAccount> AddAsync(
        AccountingDbContext db, string code, AccountingAccountType type, AccountingAccount? parent = null, bool isSystem = false)
    {
        parent ??= await RootAsync(db, type);
        var account = AccountingAccount.Create(code, $"Account {code}", type, isSystem, parent.Id);
        db.Accounts.Add(account);
        await db.SaveChangesAsync();
        return account;
    }
}
