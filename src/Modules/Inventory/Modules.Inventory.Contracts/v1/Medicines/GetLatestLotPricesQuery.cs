using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>What the most recently received lot of a medicine cost and sells at (cost per base unit).</summary>
public sealed record LatestLotPriceDto(decimal CostPrice, decimal SellingPrice);

/// <summary>
/// In-process lookup of each medicine's latest purchase cost and lot selling price: the most recently created lot (any
/// branch, written-off ones included) that carries a cost. A medicine's own cost price is set once at creation and
/// never follows purchases, so reorder costing and found stock use this instead. Medicines with no costed lot are
/// absent from the result. No HTTP endpoint.
/// </summary>
public sealed record GetLatestLotPricesQuery(IReadOnlyList<Guid> MedicineIds)
    : IQuery<IReadOnlyDictionary<Guid, LatestLotPriceDto>>;
