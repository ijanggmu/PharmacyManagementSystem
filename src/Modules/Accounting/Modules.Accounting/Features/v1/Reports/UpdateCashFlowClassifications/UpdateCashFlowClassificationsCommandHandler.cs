using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Reports.CashFlow;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.UpdateCashFlowClassifications;

/// <summary>Upserts the listed accounts' cash flow tags (a null activity deletes the tag, so the account goes back to
/// what it inherits or its default). Cash and bank accounts and root heads cannot be tagged. Reports read tags live,
/// so a change re-classifies past periods too — the statement is a view, nothing is posted.</summary>
public sealed class UpdateCashFlowClassificationsCommandHandler(AccountingDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<UpdateCashFlowClassificationsCommand, IReadOnlyList<CashFlowClassificationDto>>
{
    public async ValueTask<IReadOnlyList<CashFlowClassificationDto>> Handle(
        UpdateCashFlowClassificationsCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var before = await CashFlowClassifications.LoadAsync(dbContext, cancellationToken).ConfigureAwait(false);
        var accounts = before.Accounts.ToDictionary(a => a.Id);
        foreach (var item in command.Items)
        {
            if (!accounts.TryGetValue(item.AccountId, out var account))
            {
                throw new NotFoundException($"Account {item.AccountId} not found.");
            }

            if (item.Activity is not null && !CashFlowClassifier.IsTaggable(account))
            {
                throw new CustomException(
                    $"Account {account.Code} {account.Name} can't be tagged: cash and bank accounts are the cash the statement explains, and a root head covers the whole head.",
                    (IEnumerable<string>?)null,
                    HttpStatusCode.BadRequest);
            }
        }

        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();
        var ids = command.Items.Select(i => i.AccountId).ToList();
        var existing = await dbContext.AccountCashFlowTags
            .Where(t => ids.Contains(t.AccountId))
            .ToDictionaryAsync(t => t.AccountId, cancellationToken)
            .ConfigureAwait(false);

        foreach (var item in command.Items)
        {
            existing.TryGetValue(item.AccountId, out var row);
            if (item.Activity is null)
            {
                if (row is not null)
                {
                    dbContext.AccountCashFlowTags.Remove(row);
                }

                continue;
            }

            var activity = Enum.Parse<CashFlowActivity>(item.Activity, ignoreCase: true);
            if (row is null)
            {
                dbContext.AccountCashFlowTags.Add(AccountCashFlowTag.Create(item.AccountId, activity, actor));
            }
            else
            {
                row.Change(activity, actor);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        var after = await CashFlowClassifications.LoadAsync(dbContext, cancellationToken).ConfigureAwait(false);
        return CashFlowClassifications.ToDtos(after);
    }
}
