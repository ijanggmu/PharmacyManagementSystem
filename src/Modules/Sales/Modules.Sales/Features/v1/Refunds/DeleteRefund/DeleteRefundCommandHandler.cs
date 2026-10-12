using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Refunds.DeleteRefund;

/// <summary>
/// Soft-deletes an unposted refund. The legacy delete hard-removed the refund and its items; a posted
/// refund (completed, or reversing voucher raised) answers 409 via <c>SaleRefund.SoftDelete</c>.
/// </summary>
public sealed class DeleteRefundCommandHandler(SalesDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<DeleteRefundCommand, Guid>
{
    public async ValueTask<Guid> Handle(DeleteRefundCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var refund = await dbContext.SaleRefunds
            .FirstOrDefaultAsync(r => r.Id == command.RefundId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Refund {command.RefundId} not found.");

        if (refund.ReturnId is { } returnId)
        {
            throw new CustomException(
                $"Refund {refund.RefundNumber} pays out return {returnId}. Delete the return instead.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        refund.SoftDelete(currentUser.GetUserId().ToString());

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return refund.Id;
    }
}
