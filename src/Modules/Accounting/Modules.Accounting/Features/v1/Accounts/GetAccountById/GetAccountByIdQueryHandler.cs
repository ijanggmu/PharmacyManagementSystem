using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using FSH.Modules.Accounting.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Accounts.GetAccountById;

public sealed class GetAccountByIdQueryHandler(AccountingDbContext dbContext)
    : IQueryHandler<GetAccountByIdQuery, AccountingAccountDto>
{
    public async ValueTask<AccountingAccountDto> Handle(GetAccountByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        return await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Id == query.AccountId)
            .ToDto(dbContext)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Account {query.AccountId} not found.");
    }
}
