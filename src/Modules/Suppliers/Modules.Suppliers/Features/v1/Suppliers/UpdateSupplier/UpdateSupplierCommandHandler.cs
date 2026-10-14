using FSH.Framework.Core.Exceptions;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.UpdateSupplier;

public sealed class UpdateSupplierCommandHandler(SuppliersDbContext dbContext)
    : ICommandHandler<UpdateSupplierCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateSupplierCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var supplier = await dbContext.Suppliers
            .FirstOrDefaultAsync(s => s.Id == command.SupplierId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {command.SupplierId} not found.");

        // Only a rename is checked: a supplier that already shares its name with another (recorded before the
        // name rule existed) must still be editable — phone, address, active flag — without being forced to
        // rename first.
        if (!string.Equals(
                SupplierNameGuard.Normalize(command.Name), SupplierNameGuard.Normalize(supplier.Name), StringComparison.Ordinal))
        {
            await SupplierNameGuard.EnsureAvailableAsync(dbContext, command.Name, supplier.Id, cancellationToken)
                .ConfigureAwait(false);
        }

        // Same for the PAN: only a change is checked against the other active suppliers.
        if (SupplierPanGuard.Changes(supplier.TaxId, command.TaxId))
        {
            await SupplierPanGuard.EnsureAvailableAsync(dbContext, command.TaxId, supplier.Id, cancellationToken)
                .ConfigureAwait(false);
        }

        supplier.Update(
            command.Name, command.ContactPerson, command.Phone, command.Email,
            command.Address, SupplierPanGuard.Normalize(command.TaxId), command.IsActive, command.CreditDays);

        await SupplierNameGuard.SaveChangesAsync(dbContext, command.Name, cancellationToken).ConfigureAwait(false);
        return supplier.Id;
    }
}
