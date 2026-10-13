using FluentValidation;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services.Ird;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Ird.ResendIrdQueueItem;

/// <summary>
/// Manual resend of an IRD submission that failed for good (e.g. after fixing the CBMS credentials): the row goes
/// back to Pending with a fresh attempt budget and the tenant's queue is dispatched immediately. A bill's sale is
/// moved back from "failed" to "pending". Only a Failed row can be resent (409 otherwise).
/// </summary>
public sealed class ResendIrdQueueItemCommandHandler(
    SalesDbContext dbContext,
    IrdDocumentEnqueuer documentQueue,
    ICurrentUser currentUser) : ICommandHandler<ResendIrdQueueItemCommand, IrdResendResultDto>
{
    public async ValueTask<IrdResendResultDto> Handle(ResendIrdQueueItemCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var item = await dbContext.IrdInvoiceQueues
            .FirstOrDefaultAsync(q => q.Id == command.QueueItemId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"IRD queue item {command.QueueItemId} was not found.");

        item.Resend();

        if (item.DocumentType == IrdDocumentType.Bill)
        {
            var sale = await dbContext.Sales
                .FirstOrDefaultAsync(s => s.Id == item.SaleId, cancellationToken)
                .ConfigureAwait(false);
            if (sale is { IsIrdLocked: false, IrdStatus: IrdSyncStatus.Failed })
            {
                sale.MarkIrdDispatchFailed(item.LastError ?? "Resent to IRD.", isFinalAttempt: false);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        documentQueue.TriggerDispatch(currentUser.GetTenant());

        return new IrdResendResultDto(item.Id, item.SaleId, item.DocumentType.ToString(), item.Status.ToString());
    }
}

public sealed class ResendIrdQueueItemCommandValidator : AbstractValidator<ResendIrdQueueItemCommand>
{
    public ResendIrdQueueItemCommandValidator()
    {
        RuleFor(x => x.QueueItemId).NotEmpty();
    }
}
