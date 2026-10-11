using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Sales.UpdateSale;

/// <summary>Mirrors the legacy <c>PATCH /api/sales/{id}</c>, which only ever wrote <c>notes</c>.</summary>
public sealed class UpdateSaleCommandHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : ICommandHandler<UpdateSaleCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateSaleCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var sale = await dbContext.Sales
            .FirstOrDefaultAsync(s => s.Id == command.SaleId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.SaleId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(sale.BranchId, $"Sale {command.SaleId} not found.", cancellationToken)
            .ConfigureAwait(false);

        if (command.NotesProvided)
        {
            sale.UpdateNotes(command.Notes);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return sale.Id;
    }
}
