using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;

namespace FSH.Modules.Purchasing.Services;

/// <summary>
/// Purchasing stores only a supplier id, so before an order is raised or goods are booked against a supplier
/// the Suppliers module is asked (through its Contracts query) whether that supplier exists and is active.
/// Without this a typo'd or deleted id would post an AP ledger entry that the Suppliers handler can never
/// apply (and that dead-letters in the outbox).
/// </summary>
internal static class SupplierGuard
{
    public static async Task EnsureActiveAsync(IMediator mediator, Guid supplierId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(mediator);

        SupplierDto supplier;
        try
        {
            supplier = await mediator.Send(new GetSupplierByIdQuery(supplierId), cancellationToken).ConfigureAwait(false);
        }
        catch (NotFoundException)
        {
            throw new CustomException(
                "The supplier was not found. It may have been deleted — choose another supplier.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (!supplier.IsActive)
        {
            throw new CustomException(
                $"Supplier {supplier.Name} is inactive. Reactivate the supplier before buying from them.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
