using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.PaymentAccounts;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Accounts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.PaymentAccounts.CreateCashBankAccount;

/// <summary>Adds a cash/bank/wallet ledger account under the Assets head with the next free 10xx code, so it
/// sits in the cash &amp; bank block (reports, reconciliation, payment-method mapping all pick it up).</summary>
public sealed class CreateCashBankAccountCommandHandler(AccountingDbContext dbContext)
    : ICommandHandler<CreateCashBankAccountCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateCashBankAccountCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string assetsCode = AccountingAccount.RootHeads[AccountingAccountType.Asset].Code;
        var assets = await dbContext.Accounts
            .FirstOrDefaultAsync(a => a.Code == assetsCode && a.ParentId == null, cancellationToken)
            .ConfigureAwait(false);
        if (assets is null || !assets.IsRootHead)
        {
            throw new NotFoundException("The Assets head is missing from the chart of accounts.");
        }

        var taken = await AccountTreeRules.TakenCodesAsync(dbContext, cancellationToken).ConfigureAwait(false);
        string code;
        try
        {
            code = AccountCodeAllocator.NextCashBankCode(taken);
        }
        catch (InvalidOperationException ex)
        {
            throw AccountTreeRules.BadRequest(ex.Message);
        }

        var account = AccountingAccount.Create(code, command.Name, AccountingAccountType.Asset, parentId: assets.Id);
        dbContext.Accounts.Add(account);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return account.Id;
    }
}
