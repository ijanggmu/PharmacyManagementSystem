using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

public sealed class AccountingAccountResolver(AccountingDbContext dbContext) : IAccountingAccountResolver
{
    public async ValueTask<Guid> ResolveByCodeAsync(string code, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(code);

        string normalized = code.Trim().ToUpperInvariant();
        return await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Code == normalized)
            .Select(a => (Guid?)a.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"No account with code '{code}' found.");
    }
}
