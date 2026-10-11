using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.RestoreSupplier;

public sealed class RestoreSupplierCommandHandler(SuppliersDbContext dbContext)
    : ICommandHandler<RestoreSupplierCommand, Guid>
{
    public async ValueTask<Guid> Handle(RestoreSupplierCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var supplier = await dbContext.Suppliers
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .FirstOrDefaultAsync(s => s.Id == command.SupplierId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {command.SupplierId} not found.");

        // A live supplier may have taken this name while it was in the trash.
        await SupplierNameGuard.EnsureAvailableAsync(dbContext, supplier.Name, supplier.Id, cancellationToken)
            .ConfigureAwait(false);

        supplier.Restore();
        await SupplierNameGuard.SaveChangesAsync(dbContext, supplier.Name, cancellationToken).ConfigureAwait(false);
        return supplier.Id;
    }
}
