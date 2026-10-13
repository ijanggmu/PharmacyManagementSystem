using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using NSubstitute;

namespace Purchasing.Tests.Features;

/// <summary>
/// An <see cref="IMediator"/> substitute that answers the Suppliers/Inventory lookups Purchasing makes, from
/// in-memory tables: supplier/medicine names, the supplier-exists-and-active check (every supplier is active
/// unless listed in <c>inactiveSuppliers</c>, and missing when listed in <c>missingSuppliers</c>) and the
/// medicine catalog selling price (<c>medicinePrices</c>, 0 when absent).
/// </summary>
internal static class NamesMediator
{
    public static IMediator Create(
        IReadOnlyDictionary<Guid, string>? suppliers = null,
        IReadOnlyDictionary<Guid, string>? medicines = null,
        IReadOnlyCollection<Guid>? inactiveSuppliers = null,
        IReadOnlyCollection<Guid>? missingSuppliers = null,
        IReadOnlyDictionary<Guid, decimal>? medicinePrices = null,
        IReadOnlyCollection<Guid>? missingMedicines = null,
        IReadOnlyDictionary<Guid, int>? unitsPerPack = null)
    {
        var missingMeds = missingMedicines ?? [];
        var supplierNames = suppliers ?? new Dictionary<Guid, string>();
        var medicineNames = medicines ?? new Dictionary<Guid, string>();
        var inactive = inactiveSuppliers ?? [];
        var missing = missingSuppliers ?? [];
        var prices = medicinePrices ?? new Dictionary<Guid, decimal>();
        var packs = unitsPerPack ?? new Dictionary<Guid, int>();
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

        mediator.Send(Arg.Any<GetSupplierByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci =>
            {
                var id = ci.Arg<GetSupplierByIdQuery>().SupplierId;
                if (missing.Contains(id))
                {
                    throw new NotFoundException($"Supplier {id} not found.");
                }

                return new ValueTask<SupplierDto>(new SupplierDto(
                    id, supplierNames.GetValueOrDefault(id, "Supplier"), null, null, null, null, null,
                    0m, !inactive.Contains(id), DateTime.UtcNow, null));
            });

        mediator.Send(Arg.Any<GetMedicineByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci =>
            {
                var id = ci.Arg<GetMedicineByIdQuery>().MedicineId;
                if (missingMeds.Contains(id))
                {
                    throw new NotFoundException($"Medicine {id} not found.");
                }

                return new ValueTask<MedicineDto>(new MedicineDto(
                    Id: id, Name: medicineNames.GetValueOrDefault(id, "Medicine"), GenericName: null, CategoryId: null,
                    ReorderLevel: 0m, IsControlled: false, TotalQuantityOnHand: 0m, IsArchived: false,
                    CreatedAtUtc: DateTime.UtcNow, UpdatedAtUtc: null, UnitPrice: prices.GetValueOrDefault(id),
                    UnitsPerPack: packs.TryGetValue(id, out int pack) ? pack : null));
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
