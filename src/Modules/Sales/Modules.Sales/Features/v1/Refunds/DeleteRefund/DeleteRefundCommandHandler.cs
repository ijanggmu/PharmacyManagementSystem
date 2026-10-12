using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Refunds.DeleteRefund;

/// <summary>
/// Soft-deletes an unposted refund. The legacy delete hard-removed the refund and its items; a posted
/// refund (completed, or reversing voucher raised) answers 409 via <c>SaleRefund.SoftDelete</c>. Runs under
/// the parent sale's row lock and re-reads the refund, so it can't race a concurrent completion.
/// </summary>
public sealed class DeleteRefundCommandHandler(SalesDbContext dbContext, ICurrentUser currentUser, ICurrentBranch currentBranch)
    : ICommandHandler<DeleteRefundCommand, Guid>
{
    public async ValueTask<Guid> Handle(DeleteRefundCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var header = await dbContext.SaleRefunds.AsNoTracking()
            .Where(r => r.Id == command.RefundId)
            .Select(r => new { r.OriginalSaleId, r.BranchId })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Refund {command.RefundId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(header.BranchId, $"Refund {command.RefundId} not found.", cancellationToken)
            .ConfigureAwait(false);

        // Under the parent sale's row lock (the lock completion takes), re-read the refund: a concurrent
        // "complete" either committed first (the re-read sees it posted → 409) or waits for this delete.
        return await SalesTransaction.ExecuteAsync(
            dbContext,
            async ct =>
            {
                await SalesTransaction.LockSaleRowAsync(dbContext, header.OriginalSaleId, ct).ConfigureAwait(false);

                var refund = await dbContext.SaleRefunds
                    .FirstOrDefaultAsync(r => r.Id == command.RefundId, ct)
                    .ConfigureAwait(false)
                    ?? throw new NotFoundException($"Refund {command.RefundId} not found.");

                refund.SoftDelete(currentUser.GetUserId().ToString());
                await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
                return refund.Id;
            },
            cancellationToken).ConfigureAwait(false);
    }
}
