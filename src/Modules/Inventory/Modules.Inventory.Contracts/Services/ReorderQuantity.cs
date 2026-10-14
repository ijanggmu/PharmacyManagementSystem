namespace FSH.Modules.Inventory.Contracts.Services;

/// <summary>
/// How much to reorder — the one rule the Inventory and Purchasing reorder reports share. The target is the medicine's
/// maximum stock when set, else twice its reorder level; the suggestion is the target less the SELLABLE stock on hand,
/// rounded up to whole packs when the units per pack are known. Zero or less means nothing to order.
/// </summary>
public static class ReorderQuantity
{
    public static decimal Target(decimal reorderLevel, decimal? maximumStock) =>
        maximumStock is > 0m ? maximumStock.Value : reorderLevel * 2m;

    public static decimal Suggest(decimal reorderLevel, decimal? maximumStock, decimal sellableOnHand, int? unitsPerPack = null)
    {
        decimal shortfall = Target(reorderLevel, maximumStock) - Math.Max(0m, sellableOnHand);
        if (shortfall <= 0m)
        {
            return 0m;
        }

        return unitsPerPack is > 1
            ? Math.Ceiling(shortfall / unitsPerPack.Value) * unitsPerPack.Value
            : Math.Ceiling(shortfall);
    }
}
