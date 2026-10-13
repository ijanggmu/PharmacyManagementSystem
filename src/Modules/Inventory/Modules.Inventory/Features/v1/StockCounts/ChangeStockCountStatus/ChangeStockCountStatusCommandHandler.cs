using System.Data;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.StockCounts.ChangeStockCountStatus;

/// <summary>Submit for review, reopen counting, or cancel. None of these touch stock.</summary>
public sealed class ChangeStockCountStatusCommandHandler(
    InventoryDbContext dbContext,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider)
    : ICommandHandler<ChangeStockCountStatusCommand, Guid>
{
    public async ValueTask<Guid> Handle(ChangeStockCountStatusCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var session = await StockCountStore.LockSessionAsync(dbContext, currentBranch, command.SessionId, cancellationToken)
            .ConfigureAwait(false);
        DateTime now = timeProvider.GetUtcNow().UtcDateTime;

        switch (command.Transition)
        {
            case StockCountTransition.SubmitForReview:
                session.SubmitForReview(now);
                break;
            case StockCountTransition.Reopen:
                session.Reopen(now);
                break;
            case StockCountTransition.Cancel:
                session.Cancel(now);
                break;
            default:
                throw new CustomException(
                    $"Unknown stock count transition {command.Transition}.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return session.Id;
    }
}
