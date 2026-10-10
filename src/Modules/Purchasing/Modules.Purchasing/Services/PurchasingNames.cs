using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;

namespace FSH.Modules.Purchasing.Services;

/// <summary>
/// Supplier and medicine display names for Purchasing DTOs. Purchasing stores only ids, so names come
/// from the Suppliers and Inventory modules through their Contracts queries — one call each per batch.
/// A name that cannot be resolved (trashed supplier/medicine) is simply absent.
/// </summary>
internal sealed record PurchasingNames(
    IReadOnlyDictionary<Guid, string> Suppliers,
    IReadOnlyDictionary<Guid, string> Medicines)
{
    public static PurchasingNames Empty { get; } = new(new Dictionary<Guid, string>(), new Dictionary<Guid, string>());

    public string? Supplier(Guid id) => Suppliers.TryGetValue(id, out var name) ? name : null;

    public string? Medicine(Guid id) => Medicines.TryGetValue(id, out var name) ? name : null;

    public static async ValueTask<PurchasingNames> LoadAsync(
        IMediator mediator,
        IEnumerable<Guid> supplierIds,
        IEnumerable<Guid> medicineIds,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(mediator);

        var suppliers = supplierIds.Where(id => id != Guid.Empty).Distinct().ToList();
        var medicines = medicineIds.Where(id => id != Guid.Empty).Distinct().ToList();

        var supplierNames = new Dictionary<Guid, string>();
        foreach (var chunk in suppliers.Chunk(GetSupplierLookupQuery.MaxLimit))
        {
            var found = await mediator.Send(
                new GetSupplierLookupQuery(IncludeInactive: true, Limit: GetSupplierLookupQuery.MaxLimit, Ids: chunk),
                cancellationToken).ConfigureAwait(false);
            foreach (var supplier in found ?? [])
            {
                supplierNames[supplier.Id] = supplier.Name;
            }
        }

        IReadOnlyDictionary<Guid, string>? medicineNames = medicines.Count > 0
            ? await mediator.Send(new GetMedicineNamesQuery(medicines), cancellationToken).ConfigureAwait(false)
            : null;

        return new PurchasingNames(supplierNames, medicineNames ?? new Dictionary<Guid, string>());
    }
}
