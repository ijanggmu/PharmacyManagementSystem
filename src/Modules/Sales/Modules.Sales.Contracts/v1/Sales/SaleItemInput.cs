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
/// base units, exactly as before.
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

    /// <summary>True when the line was sold in packs.</summary>
    public bool IsSoldInPacks() => string.Equals(SaleUnit?.Trim(), PackUnit, StringComparison.OrdinalIgnoreCase);
}
