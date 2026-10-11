using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Returns.DeleteReturn;

/// <summary>
/// Soft-deletes a return that has not restored stock. The legacy delete hard-removed the return and its
/// items; a completed return (stock restored) answers 409 via <c>SaleReturn.SoftDelete</c>.
/// </summary>
public sealed class DeleteReturnCommandHandler(SalesDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<DeleteReturnCommand, Guid>
{
    public async ValueTask<Guid> Handle(DeleteReturnCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var saleReturn = await dbContext.SaleReturns
            .FirstOrDefaultAsync(r => r.Id == command.ReturnId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Return {command.ReturnId} not found.");

        saleReturn.SoftDelete(currentUser.GetUserId().ToString());

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return saleReturn.Id;
    }
}
