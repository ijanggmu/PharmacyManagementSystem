using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.PaymentAccounts;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.PaymentAccounts.UpdatePaymentMethodAccounts;

/// <summary>Upserts the listed methods' mapping rows (a null account deletes the row, so the method goes back
/// to its built-in default). Every target is checked first (<see cref="PaymentAccountTargets"/>), so one bad
/// account rejects the whole change. Postings already made are untouched — only new money uses the new account.</summary>
public sealed class UpdatePaymentMethodAccountsCommandHandler(AccountingDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<UpdatePaymentMethodAccountsCommand, IReadOnlyList<PaymentMethodAccountDto>>
{
    public async ValueTask<IReadOnlyList<PaymentMethodAccountDto>> Handle(
        UpdatePaymentMethodAccountsCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        foreach (var input in command.Mappings.Where(m => m.AccountId is not null))
        {
            await PaymentAccountTargets
                .EnsureValidForMethodAsync(dbContext, input.Method, input.AccountId!.Value, cancellationToken)
                .ConfigureAwait(false);
        }

        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();
        var existing = await dbContext.PaymentMethodAccounts
            .ToDictionaryAsync(m => m.Method, StringComparer.Ordinal, cancellationToken)
            .ConfigureAwait(false);

        foreach (var input in command.Mappings)
        {
            string method = PaymentMethodAccounts.Normalize(input.Method);
            existing.TryGetValue(method, out var row);
            if (input.AccountId is not { } accountId)
            {
                if (row is not null)
                {
                    dbContext.PaymentMethodAccounts.Remove(row);
                }
            }
            else if (row is null)
            {
                dbContext.PaymentMethodAccounts.Add(AccountingPaymentMethodAccount.Create(method, accountId, actor));
            }
            else
            {
                row.Retarget(accountId, actor);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return await PaymentMethodAccountsView.BuildAsync(dbContext, cancellationToken).ConfigureAwait(false);
    }
}
