using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The chart's cash and bank accounts: asset accounts in the <c>10xx</c> block — Cash (1000), Bank (1010)
/// and every till, petty-cash or bank account a tenant adds beneath them. The same rule the web app's
/// opening-balance setup uses for its "Cash &amp; bank" section.
/// </summary>
internal static class CashBankAccounts
{
    public const string CodePrefix = "10";

    public static Task<List<Guid>> IdsAsync(AccountingDbContext dbContext, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        return dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.AccountType == AccountingAccountType.Asset && a.Code.StartsWith(CodePrefix))
            .Select(a => a.Id)
            .ToListAsync(cancellationToken);
    }
}
