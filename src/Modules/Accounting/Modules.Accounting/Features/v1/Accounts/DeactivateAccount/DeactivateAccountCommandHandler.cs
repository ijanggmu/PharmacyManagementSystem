using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
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

        // Checked first so a system account gets its own message (409) before any balance lookup.
        if (account.IsSystem)
        {
            account.Deactivate();
        }

        // An inactive account can't be posted to, so a balance left on it could never be cleared.
        decimal balance = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where line.AccountId == account.Id
            select line.DebitAmount - line.CreditAmount)
            .SumAsync(cancellationToken)
            .ConfigureAwait(false);
        if (balance != 0m)
        {
            throw new CustomException(
                string.Create(
                    CultureInfo.InvariantCulture,
                    $"{AccountTreeRules.Label(account)} still has a balance of {Math.Abs(balance):N2} {(balance > 0m ? "Dr" : "Cr")}. Move the balance to another account with a journal before deactivating it."),
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        account.Deactivate();
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return account.Id;
    }
}
