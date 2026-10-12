using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Returns.DeleteReturn;

/// <summary>
/// Soft-deletes a return that has not restored stock. The legacy delete hard-removed the return and its
/// items; a completed return (stock restored) answers 409 via <c>SaleReturn.SoftDelete</c>. Runs under the
/// parent sale's row lock and re-reads the return, so it can't race a concurrent completion.
/// </summary>
public sealed class DeleteReturnCommandHandler(SalesDbContext dbContext, ICurrentUser currentUser, ICurrentBranch currentBranch)
    : ICommandHandler<DeleteReturnCommand, Guid>
{
    public async ValueTask<Guid> Handle(DeleteReturnCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var header = await dbContext.SaleReturns.AsNoTracking()
            .Where(r => r.Id == command.ReturnId)
            .Select(r => new { r.SaleId, r.BranchId })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Return {command.ReturnId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(header.BranchId, $"Return {command.ReturnId} not found.", cancellationToken)
            .ConfigureAwait(false);

        // Under the parent sale's row lock (the lock completion takes), re-read the return: a concurrent
        // "complete" either committed first (the re-read sees it posted → 409) or waits for this delete.
        return await SalesTransaction.ExecuteAsync(
            dbContext,
            async ct =>
            {
                await SalesTransaction.LockSaleRowAsync(dbContext, header.SaleId, ct).ConfigureAwait(false);

                var saleReturn = await dbContext.SaleReturns
                    .FirstOrDefaultAsync(r => r.Id == command.ReturnId, ct)
                    .ConfigureAwait(false)
                    ?? throw new NotFoundException($"Return {command.ReturnId} not found.");

                saleReturn.SoftDelete(currentUser.GetUserId().ToString());
                await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
                return saleReturn.Id;
            },
            cancellationToken).ConfigureAwait(false);
    }
}
