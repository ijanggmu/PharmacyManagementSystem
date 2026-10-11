using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.DeleteSupplier;

/// <summary>
/// Soft-deletes a supplier (via <c>ISoftDeletable</c>) only when it has no posted purchases or
/// payments. Any AP ledger row means the supplier is referenced by posted documents, so the
/// delete is refused with 409 and the supplier should be marked inactive instead. Mirrors the
/// source system's checkSupplierDeletable guard.
/// </summary>
public sealed class DeleteSupplierCommandHandler(SuppliersDbContext dbContext)
    : ICommandHandler<DeleteSupplierCommand, Unit>
{
    public async ValueTask<Unit> Handle(DeleteSupplierCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var supplier = await dbContext.Suppliers
            .FirstOrDefaultAsync(s => s.Id == command.SupplierId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {command.SupplierId} not found.");

        bool hasPostedHistory = await dbContext.SupplierLedgerEntries
            .AnyAsync(e => e.SupplierId == command.SupplierId, cancellationToken)
            .ConfigureAwait(false);

        if (hasPostedHistory)
        {
            throw new CustomException(
                "Supplier cannot be deleted because it has ledger/voucher history. Mark it inactive instead.",
                (IEnumerable<string>?)null,
                HttpStatusCode.Conflict);
        }

        dbContext.Suppliers.Remove(supplier);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return Unit.Value;
    }
}
