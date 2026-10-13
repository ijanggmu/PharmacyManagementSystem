using FSH.Modules.Purchasing.Domain;

namespace FSH.Modules.Purchasing.Services;

/// <summary>A purchase line converted to base units, with the terms the aggregate stores.</summary>
internal readonly record struct BasePurchaseLine(decimal Quantity, decimal UnitCostPrice, PurchaseLineTerms Terms);

/// <summary>
/// Converts a line entered in packs (e.g. 3 boxes of 10 strips at Rs 1,200 a box) to base units: quantity and free
/// quantity × units per pack, unit cost ÷ units per pack (2 dp). The pack size and pack rate are kept on the line so
/// its gross stays exactly packs × pack rate. A line entered in base units passes through unchanged.
/// </summary>
internal static class PurchaseLinePacks
{
    public static BasePurchaseLine ToBase(
        decimal quantity, decimal unitCostPrice, decimal freeQuantity, decimal discountPercent, decimal discountAmount,
        bool inPacks, int? unitsPerPack, string? medicineName)
    {
        if (!inPacks)
        {
            return new BasePurchaseLine(
                quantity, unitCostPrice, new PurchaseLineTerms(freeQuantity, discountPercent, discountAmount));
        }

        if (unitsPerPack is not > 0)
        {
            throw PurchaseLineMath.BadRequest(
                $"{medicineName ?? "This medicine"} has no pack size set. Enter its quantity in units, or set its units per pack first.");
        }

        decimal pack = unitsPerPack.Value;
        return new BasePurchaseLine(
            quantity * pack,
            PurchaseLineMath.Round(unitCostPrice / pack),
            new PurchaseLineTerms(freeQuantity * pack, discountPercent, discountAmount, pack, unitCostPrice));
    }
}
