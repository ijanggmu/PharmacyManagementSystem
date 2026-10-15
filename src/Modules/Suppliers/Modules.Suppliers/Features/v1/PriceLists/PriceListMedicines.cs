using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;

namespace FSH.Modules.Suppliers.Features.v1.PriceLists;

/// <summary>Name and pack size of the medicines on a price-list page, resolved from Inventory once per id.</summary>
internal static class PriceListMedicines
{
    public const string UnknownName = "Medicine";

    public static async Task<Dictionary<Guid, (string Name, int? UnitsPerPack)>> ResolveAsync(
        IMediator mediator, IEnumerable<Guid> medicineIds, CancellationToken cancellationToken)
    {
        var result = new Dictionary<Guid, (string Name, int? UnitsPerPack)>();
        foreach (Guid id in medicineIds.Distinct())
        {
            try
            {
                var medicine = await mediator.Send(new GetMedicineByIdQuery(id), cancellationToken).ConfigureAwait(false);
                result[id] = (medicine.Name, medicine.UnitsPerPack);
            }
            catch (NotFoundException)
            {
                result[id] = (UnknownName, null);
            }
        }

        return result;
    }
}
