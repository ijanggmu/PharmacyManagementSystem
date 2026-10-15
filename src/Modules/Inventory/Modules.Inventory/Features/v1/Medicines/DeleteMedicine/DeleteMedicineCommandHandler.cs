using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.DeleteMedicine;

/// <summary>
/// Archives (soft-deletes) a medicine. An archived medicine disappears from the till and the stock lists, so it is
/// refused (409) while any branch still holds stock of it — that stock would become invisible and unsellable — or
/// while an open purchase order still has a line for it (it could no longer be received). Sell, dispose, transfer or
/// return the stock and receive or cancel the orders first.
/// </summary>
public sealed class DeleteMedicineCommandHandler(InventoryDbContext dbContext, IMediator mediator)
    : ICommandHandler<DeleteMedicineCommand, Unit>
{
    public async ValueTask<Unit> Handle(DeleteMedicineCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var medicine = await dbContext.Medicines
            .FirstOrDefaultAsync(m => m.Id == command.MedicineId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Medicine {command.MedicineId} not found.");

        decimal onHand = await dbContext.MedicineBatches
            .AsNoTracking()
            .Where(b => b.MedicineId == medicine.Id && !b.IsDisposed && b.QuantityOnHand > 0)
            .SumAsync(b => b.QuantityOnHand, cancellationToken)
            .ConfigureAwait(false);
        if (onHand > 0)
        {
            throw new CustomException(
                string.Format(
                    CultureInfo.InvariantCulture,
                    "{0} still has {1:0.###} units in stock. Sell, dispose, transfer or return them before archiving the medicine.",
                    medicine.Name, onHand),
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        int openOrders = await mediator.Send(new CountOpenPurchaseOrdersForMedicineQuery(medicine.Id), cancellationToken)
            .ConfigureAwait(false);
        if (openOrders > 0)
        {
            throw new CustomException(
                string.Format(
                    CultureInfo.InvariantCulture,
                    "{0} is on {1} open purchase order(s). Receive or cancel them before archiving the medicine.",
                    medicine.Name, openOrders),
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        dbContext.Medicines.Remove(medicine);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return Unit.Value;
    }
}
