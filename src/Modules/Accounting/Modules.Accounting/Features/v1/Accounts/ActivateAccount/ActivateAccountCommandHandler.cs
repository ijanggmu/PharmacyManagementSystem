using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using FSH.Modules.Accounting.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Accounts.ActivateAccount;

public sealed class ActivateAccountCommandHandler(AccountingDbContext dbContext)
    : ICommandHandler<ActivateAccountCommand, Guid>
{
    public async ValueTask<Guid> Handle(ActivateAccountCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var account = await dbContext.Accounts
            .FirstOrDefaultAsync(a => a.Id == command.AccountId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Account {command.AccountId} not found.");

        account.Activate();
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return account.Id;
    }
}
