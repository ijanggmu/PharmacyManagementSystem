using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
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

        supplier.Restore();
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return supplier.Id;
    }
}
