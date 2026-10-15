namespace FSH.Modules.Sales.Contracts.v1.Sales;

/// <summary>
/// A cart line. <paramref name="UnitPrice"/> is accepted for request-shape compatibility only and is
/// IGNORED: the unit price is always read from the medicine catalog / FEFO batch selling price.
/// <paramref name="DiscountPercent"/> (0-100) is the legacy per-line percent discount;
/// <paramref name="DiscountAmount"/> is an additional absolute discount, kept for existing callers.
/// <para>
/// Units: <paramref name="Quantity"/> is ALWAYS in base units (e.g. tablets) — stock, pricing, VAT and accounting
/// use it. A line sold in packs also sends <paramref name="SaleUnit"/> = <c>"pack"</c> and
/// <paramref name="PackCount"/>; the server checks Quantity = PackCount × the medicine's UnitsPerPack and records
/// the pack on the sale line for the invoice ("2 strips (20 tablets)"). Omitted (or <c>"base"</c>) = sold in
/// base units, exactly as before. A line sold in boxes sends <c>"box"</c> with <paramref name="PackCount"/> = the
/// number of boxes; the server checks Quantity = boxes × UnitsPerPack × PacksPerBox and records the box as the
/// line's pack (so the invoice reads "2 boxes (200 tablets)").
/// </para>
/// </summary>
public sealed record SaleItemInput(
    Guid MedicineId,
    decimal Quantity,
    decimal UnitPrice = 0m,
    decimal DiscountAmount = 0m,
    decimal DiscountPercent = 0m,
    string? SaleUnit = null,
    int? PackCount = null)
{
    /// <summary><see cref="SaleUnit"/> value for a line sold in base units (the default).</summary>
    public const string BaseUnit = "base";

    /// <summary><see cref="SaleUnit"/> value for a line sold in whole packs.</summary>
    public const string PackUnit = "pack";

    /// <summary><see cref="SaleUnit"/> value for a line sold in whole boxes (<see cref="PackCount"/> = boxes).</summary>
    public const string BoxUnit = "box";

    /// <summary>True when the line was sold in packs.</summary>
    public bool IsSoldInPacks() => string.Equals(SaleUnit?.Trim(), PackUnit, StringComparison.OrdinalIgnoreCase);

    /// <summary>True when the line was sold in boxes.</summary>
    public bool IsSoldInBoxes() => string.Equals(SaleUnit?.Trim(), BoxUnit, StringComparison.OrdinalIgnoreCase);

    /// <summary>True when the line was sold in a counted unit (packs or boxes) and so carries <see cref="PackCount"/>.</summary>
    public bool IsSoldInWholeUnits() => IsSoldInPacks() || IsSoldInBoxes();

    /// <summary>True when <paramref name="saleUnit"/> is null or one of base / pack / box (case-insensitive).</summary>
    public static bool IsKnownSaleUnit(string? saleUnit) =>
        saleUnit is null
        || string.Equals(saleUnit.Trim(), BaseUnit, StringComparison.OrdinalIgnoreCase)
        || string.Equals(saleUnit.Trim(), PackUnit, StringComparison.OrdinalIgnoreCase)
        || string.Equals(saleUnit.Trim(), BoxUnit, StringComparison.OrdinalIgnoreCase);
}
