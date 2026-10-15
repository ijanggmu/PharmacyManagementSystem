using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

/// <summary>
/// How a cart line sold in packs is described on the invoice: <see cref="UnitsPerPack"/> base units make one
/// pack. Stock, prices, VAT and accounting stay in base units — this is a display snapshot taken at sale time, so a
/// later change to the medicine's pack size never rewrites an issued invoice.
/// </summary>
public sealed record SaleItemPackUnit
{
    public const int MaxLabelLength = 50;

    /// <summary>Unit-label words that name a pack rather than a single dose (Medicine.UnitLabel holds either).</summary>
    private static readonly HashSet<string> PackWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "strip", "strips", "blister", "blisters", "box", "boxes", "pack", "packs", "packet", "packets",
        "carton", "cartons", "bottle", "bottles", "jar", "jars", "tube", "tubes", "card", "cards",
    };

    /// <summary>Dosage-form keywords mapped to the base unit's label; anything else is a plain "unit".</summary>
    private static readonly (string Keyword, string Label)[] FormBaseLabels =
    [
        ("tablet", "tablet"), ("capsule", "capsule"), ("sachet", "sachet"), ("vial", "vial"),
        ("ampoule", "ampoule"), ("ampule", "ampoule"), ("suppositor", "suppository"), ("lozenge", "lozenge"),
    ];

    public SaleItemPackUnit(int unitsPerPack, string packLabel, string baseUnitLabel)
    {
        if (unitsPerPack < 1)
        {
            throw new CustomException("Units per pack must be at least 1.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        ArgumentException.ThrowIfNullOrWhiteSpace(packLabel);
        ArgumentException.ThrowIfNullOrWhiteSpace(baseUnitLabel);
        UnitsPerPack = unitsPerPack;
        PackLabel = Clip(packLabel);
        BaseUnitLabel = Clip(baseUnitLabel);
    }

    public int UnitsPerPack { get; }

    public string PackLabel { get; }

    public string BaseUnitLabel { get; }

    /// <summary>
    /// The pack description of a medicine, or null when it has no pack size. <paramref name="unitLabel"/> is
    /// Medicine.UnitLabel, which names either the pack ("Strip") or the base unit ("Tablet"): a pack word becomes
    /// the pack label (base unit taken from the dosage form), anything else is the base unit of a generic "pack".
    /// Mirrored by the web app's <c>resolveSaleUnits</c> (features/sales/lib/sale-units.ts).
    /// </summary>
    public static SaleItemPackUnit? ForMedicine(int? unitsPerPack, string? unitLabel, string? form)
    {
        if (unitsPerPack is not { } perPack || perPack < 1)
        {
            return null;
        }

#pragma warning disable CA1308 // display label shown lower-case on the invoice ("2 strips"), not security-sensitive
        string? label = string.IsNullOrWhiteSpace(unitLabel) ? null : unitLabel.Trim().ToLowerInvariant();
#pragma warning restore CA1308
        if (label is not null && PackWords.Contains(label))
        {
            return new SaleItemPackUnit(perPack, Singular(label), BaseLabelFromForm(form));
        }

        return new SaleItemPackUnit(perPack, "pack", label ?? BaseLabelFromForm(form));
    }

    /// <summary>
    /// The box description of a medicine (box › pack › base), or null when it has no pack size or no box size. A
    /// line sold in boxes is recorded like a pack line whose "pack" is the box: <see cref="UnitsPerPack"/> = units
    /// per box (UnitsPerPack × PacksPerBox) and <see cref="PackLabel"/> = the box label ("box" when blank), so
    /// returns and reprints read it from the same snapshot. The base label resolves exactly as in
    /// <see cref="ForMedicine"/>. Mirrored by the web app's <c>resolveSaleUnits</c>.
    /// </summary>
    public static SaleItemPackUnit? ForMedicineBox(int? unitsPerPack, int? packsPerBox, string? boxLabel, string? unitLabel, string? form)
    {
        if (ForMedicine(unitsPerPack, unitLabel, form) is not { } pack || packsPerBox is not { } perBox || perBox < 1)
        {
            return null;
        }

#pragma warning disable CA1308 // display label shown lower-case on the invoice ("2 boxes"), not security-sensitive
        string label = string.IsNullOrWhiteSpace(boxLabel) ? "box" : Singular(boxLabel.Trim().ToLowerInvariant());
#pragma warning restore CA1308
        return new SaleItemPackUnit(checked(pack.UnitsPerPack * perBox), label, pack.BaseUnitLabel);
    }

    /// <summary>
    /// Checks a pack-sold cart line: <paramref name="packCount"/> must be a whole number of packs and
    /// <paramref name="baseQuantity"/> exactly that many packs in base units (400 otherwise).
    /// </summary>
    public void EnsureConsistent(decimal baseQuantity, decimal packCount, string medicineName)
    {
        if (packCount <= 0m || packCount != decimal.Truncate(packCount))
        {
            throw new CustomException(
                $"{medicineName}: sell a whole number of {PackLabel}s.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (baseQuantity != packCount * UnitsPerPack)
        {
            throw new CustomException(
                string.Create(
                    CultureInfo.InvariantCulture,
                    $"{medicineName}: {packCount:0} {PackLabel}(s) is {packCount * UnitsPerPack:0} {BaseUnitLabel}(s), not {baseQuantity:0.###}."),
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }
    }

    private static string BaseLabelFromForm(string? form)
    {
        if (string.IsNullOrWhiteSpace(form))
        {
            return "unit";
        }

        foreach (var (keyword, label) in FormBaseLabels)
        {
            if (form.Contains(keyword, StringComparison.OrdinalIgnoreCase))
            {
                return label;
            }
        }

        return "unit";
    }

    private static string Singular(string label) => label switch
    {
        "boxes" => "box",
        _ when label.EndsWith('s') => label[..^1],
        _ => label,
    };

    private static string Clip(string label)
    {
        string trimmed = label.Trim();
        return trimmed.Length <= MaxLabelLength ? trimmed : trimmed[..MaxLabelLength];
    }
}
