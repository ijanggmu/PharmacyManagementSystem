using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.CostHistory;
using Mediator;

namespace FSH.Modules.Suppliers.Features.v1.CostHistory.GetSupplierCostHistory;

/// <summary>
/// Ports <c>getSupplierCostHistory</c> (supplier-cost-history-service.ts) as a pure cross-module
/// aggregation: the received purchase-order lines come from Purchasing
/// (<see cref="GetSupplierPurchaseHistoryQuery"/>), each distinct medicine's display name is
/// resolved from Inventory (<see cref="GetMedicineByIdQuery"/>, cached per distinct id to avoid
/// resolving the same medicine twice) — this module owns no medicine/receipt data itself, so there is
/// no SuppliersDbContext access here at all.
/// </summary>
public sealed class GetSupplierCostHistoryQueryHandler(IMediator mediator)
    : IQueryHandler<GetSupplierCostHistoryQuery, IReadOnlyList<SupplierCostHistoryDto>>
{
    public async ValueTask<IReadOnlyList<SupplierCostHistoryDto>> Handle(
        GetSupplierCostHistoryQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var rows = await mediator.Send(
            new GetSupplierPurchaseHistoryQuery(query.SupplierId, query.Limit), cancellationToken)
            .ConfigureAwait(false);

        var result = new List<SupplierCostHistoryDto>(rows.Count);
        var nameCache = new Dictionary<Guid, string>();

        foreach (var row in rows)
        {
            if (!nameCache.TryGetValue(row.MedicineId, out var name))
            {
                try
                {
                    var medicine = await mediator.Send(new GetMedicineByIdQuery(row.MedicineId), cancellationToken).ConfigureAwait(false);
                    name = medicine.Name;
                }
                catch (NotFoundException)
                {
                    name = "Medicine";
                }

                nameCache[row.MedicineId] = name;
            }

            result.Add(new SupplierCostHistoryDto(row.MedicineId, name, row.ReceiptDateUtc, row.UnitCostPrice, row.Quantity));
        }

        return result;
    }
}
