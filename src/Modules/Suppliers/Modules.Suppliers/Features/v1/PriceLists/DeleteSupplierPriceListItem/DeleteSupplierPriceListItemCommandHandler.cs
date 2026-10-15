using FSH.Framework.Core.Exceptions;
using FSH.Modules.Suppliers.Contracts.v1.PriceLists;
using FSH.Modules.Suppliers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.PriceLists.DeleteSupplierPriceListItem;

/// <summary>Deactivates the row (it stays for history and stops prefilling orders). Repeating it is a no-op.</summary>
public sealed class DeleteSupplierPriceListItemCommandHandler(SuppliersDbContext dbContext)
    : ICommandHandler<DeleteSupplierPriceListItemCommand, Unit>
{
    public async ValueTask<Unit> Handle(DeleteSupplierPriceListItemCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var item = await dbContext.SupplierPriceListItems
            .FirstOrDefaultAsync(i => i.Id == command.ItemId && i.SupplierId == command.SupplierId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Price-list item {command.ItemId} not found for this supplier.");

        if (item.IsActive)
        {
            item.Deactivate(DateTime.UtcNow);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }

        return Unit.Value;
    }
}
