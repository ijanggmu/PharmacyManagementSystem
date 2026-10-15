using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Suppliers.Contracts.v1.PriceLists;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Data.Configurations;
using FSH.Modules.Suppliers.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace FSH.Modules.Suppliers.Features.v1.PriceLists.UpsertSupplierPriceListItem;

/// <summary>
/// Creates or updates one price-list row. The supplier must exist and be active (an inactive supplier can't be
/// given new prices: 409), the medicine must exist in Inventory (404 from <see cref="GetMedicineByIdQuery"/>), and
/// no other active row of the same supplier and medicine may start on the same day (409 — checked up front, and
/// again by the unique filtered index for a concurrent insert).
/// </summary>
public sealed class UpsertSupplierPriceListItemCommandHandler(SuppliersDbContext dbContext, IMediator mediator)
    : ICommandHandler<UpsertSupplierPriceListItemCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpsertSupplierPriceListItemCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var supplier = await dbContext.Suppliers.AsNoTracking()
            .Where(s => s.Id == command.SupplierId)
            .Select(s => new { s.Name, s.IsActive })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {command.SupplierId} not found.");
        if (!supplier.IsActive)
        {
            throw Conflict($"Supplier {supplier.Name} is inactive. Activate it before changing its price list.");
        }

        // Throws NotFoundException when the medicine doesn't exist (or is trashed).
        _ = await mediator.Send(new GetMedicineByIdQuery(command.MedicineId), cancellationToken).ConfigureAwait(false);

        bool clash = await dbContext.SupplierPriceListItems.AnyAsync(
                i => i.IsActive
                    && i.SupplierId == command.SupplierId
                    && i.MedicineId == command.MedicineId
                    && i.ValidFrom == command.ValidFrom
                    && (command.ItemId == null || i.Id != command.ItemId),
                cancellationToken)
            .ConfigureAwait(false);
        if (clash)
        {
            throw DuplicateStart(command.ValidFrom);
        }

        DateTime now = DateTime.UtcNow;
        SupplierPriceListItem item;
        if (command.ItemId is { } itemId)
        {
            item = await dbContext.SupplierPriceListItems
                .FirstOrDefaultAsync(i => i.Id == itemId && i.SupplierId == command.SupplierId && i.IsActive, cancellationToken)
                .ConfigureAwait(false)
                ?? throw new NotFoundException($"Price-list item {itemId} not found for this supplier.");
            item.Update(command.MedicineId, command.UnitCost, command.MinOrderQuantity, command.ValidFrom, command.ValidTo, command.Notes, now);
        }
        else
        {
            item = SupplierPriceListItem.Create(
                command.SupplierId, command.MedicineId, command.UnitCost, command.MinOrderQuantity,
                command.ValidFrom, command.ValidTo, command.Notes, now);
            dbContext.SupplierPriceListItems.Add(item);
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: SupplierPriceListItemConfiguration.ActiveStartIndex,
        })
        {
            throw DuplicateStart(command.ValidFrom);
        }

        return item.Id;
    }

    private static CustomException DuplicateStart(DateOnly validFrom) =>
        Conflict($"This supplier already has a price for this medicine starting {validFrom:yyyy-MM-dd}. Edit that one instead.");

    private static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
}
