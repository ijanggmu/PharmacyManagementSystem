using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using FSH.Modules.Accounting.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Accounts.DeactivateAccount;

public sealed class DeactivateAccountCommandHandler(AccountingDbContext dbContext)
    : ICommandHandler<DeactivateAccountCommand, Guid>
{
    public async ValueTask<Guid> Handle(DeactivateAccountCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var account = await dbContext.Accounts
            .FirstOrDefaultAsync(a => a.Id == command.AccountId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Account {command.AccountId} not found.");

        bool hasActiveChildren = await dbContext.Accounts
            .AnyAsync(a => a.ParentId == account.Id && a.IsActive, cancellationToken)
            .ConfigureAwait(false);
        if (hasActiveChildren)
        {
            throw AccountTreeRules.BadRequest(
                $"{AccountTreeRules.Label(account)} still has active sub-accounts. Deactivate or move them first.");
        }

        account.Deactivate();
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return account.Id;
    }
}
