using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using NSubstitute;

namespace Purchasing.Tests.Features;

/// <summary>
/// An <see cref="IMediator"/> substitute that answers the Suppliers/Inventory name lookups Purchasing
/// makes, from in-memory supplier and medicine name tables.
/// </summary>
internal static class NamesMediator
{
    public static IMediator Create(
        IReadOnlyDictionary<Guid, string>? suppliers = null,
        IReadOnlyDictionary<Guid, string>? medicines = null)
    {
        var supplierNames = suppliers ?? new Dictionary<Guid, string>();
        var medicineNames = medicines ?? new Dictionary<Guid, string>();
        var mediator = Substitute.For<IMediator>();

#pragma warning disable CA2012 // NSubstitute stub set-up, not a consumed ValueTask

        mediator.Send(Arg.Any<GetSupplierLookupQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci =>
            {
                var query = ci.Arg<GetSupplierLookupQuery>();
                IEnumerable<KeyValuePair<Guid, string>> rows = supplierNames;
                if (query.Ids is { Count: > 0 } ids)
                {
                    rows = rows.Where(kv => ids.Contains(kv.Key));
                }

                if (!string.IsNullOrWhiteSpace(query.Search))
                {
                    rows = rows.Where(kv => kv.Value.Contains(query.Search.Trim(), StringComparison.OrdinalIgnoreCase));
                }

                IReadOnlyList<SupplierLookupDto> result = rows
                    .Select(kv => new SupplierLookupDto(kv.Key, kv.Value, null, true))
                    .ToList();
                return new ValueTask<IReadOnlyList<SupplierLookupDto>>(result);
            });

        mediator.Send(Arg.Any<GetMedicineNamesQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci =>
            {
                var query = ci.Arg<GetMedicineNamesQuery>();
                IReadOnlyDictionary<Guid, string> result = medicineNames
                    .Where(kv => query.MedicineIds.Contains(kv.Key))
                    .ToDictionary(kv => kv.Key, kv => kv.Value);
                return new ValueTask<IReadOnlyDictionary<Guid, string>>(result);
            });

#pragma warning restore CA2012

        return mediator;
    }
}
