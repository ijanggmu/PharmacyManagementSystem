using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Accounts.CreateAccount;

public sealed class CreateAccountCommandHandler(AccountingDbContext dbContext)
    : ICommandHandler<CreateAccountCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateAccountCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var parent = await dbContext.Accounts
            .FirstOrDefaultAsync(a => a.Id == command.ParentId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Parent account {command.ParentId} not found.");

        await AccountTreeRules.EnsureCanHoldChildrenAsync(dbContext, parent, cancellationToken).ConfigureAwait(false);

        var taken = await AccountTreeRules.TakenCodesAsync(dbContext, cancellationToken).ConfigureAwait(false);
        string code;
        try
        {
            code = AccountCodeAllocator.NextChildCode(parent, taken);
        }
        catch (InvalidOperationException ex)
        {
            throw AccountTreeRules.BadRequest(ex.Message);
        }

        var account = AccountingAccount.Create(code, command.Name, parent.AccountType, parentId: parent.Id);
        dbContext.Accounts.Add(account);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return account.Id;
    }
}
