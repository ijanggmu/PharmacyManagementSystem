using FSH.Framework.Core.Exceptions;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Resolves supplier display names through the Suppliers contract query (never its runtime project).
/// A supplier the lookup cannot find is left out of the map, so the DTO keeps a null name.
/// </summary>
internal static class SupplierNameResolver
{
    public static async Task<IReadOnlyDictionary<Guid, string>> ResolveAsync(
        IMediator mediator, IEnumerable<Guid> supplierIds, CancellationToken cancellationToken = default)
    {
        var names = new Dictionary<Guid, string>();
        foreach (var supplierId in supplierIds.Distinct())
        {
            try
            {
                var supplier = await mediator.Send(new GetSupplierByIdQuery(supplierId), cancellationToken).ConfigureAwait(false);
                if (supplier?.Name is { Length: > 0 } name)
                {
                    names[supplierId] = name;
                }
            }
            catch (NotFoundException)
            {
                // Supplier no longer exists; the DTO keeps a null name.
            }
        }

        return names;
    }
}
