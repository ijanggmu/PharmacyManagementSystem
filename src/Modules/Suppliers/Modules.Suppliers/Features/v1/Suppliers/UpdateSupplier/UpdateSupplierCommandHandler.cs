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

        await SupplierNameGuard.EnsureAvailableAsync(dbContext, command.Name, supplier.Id, cancellationToken)
            .ConfigureAwait(false);

        supplier.Update(
            command.Name, command.ContactPerson, command.Phone, command.Email,
            command.Address, command.TaxId, command.IsActive);

        await SupplierNameGuard.SaveChangesAsync(dbContext, command.Name, cancellationToken).ConfigureAwait(false);
        return supplier.Id;
    }
}
