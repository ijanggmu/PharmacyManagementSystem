using FSH.Framework.Core.Domain;

namespace FSH.Modules.Suppliers.Domain;

/// <summary>
/// The purchase price agreed with a supplier for one medicine over a validity window. <see cref="UnitCost"/> is
/// per BASE unit (e.g. per tablet), so it does not depend on how the medicine is packed. Rows are never deleted:
/// removing one deactivates it, which keeps the history of what was agreed. Only one active row may start on a
/// given day for the same supplier and medicine (unique filtered index); on a date, the row with the latest
/// <see cref="ValidFrom"/> whose window covers that date is the price (see GetSupplierPricesQueryHandler).
/// </summary>
public sealed class SupplierPriceListItem : AggregateRoot<Guid>
{
    public const int NotesMaxLength = 200;

    public Guid SupplierId { get; private set; }
    public Guid MedicineId { get; private set; }

    /// <summary>Agreed cost per base unit, before VAT.</summary>
    public decimal UnitCost { get; private set; }

    /// <summary>Smallest order the price applies to, in base units. Null = no minimum.</summary>
    public decimal? MinOrderQuantity { get; private set; }

    public DateOnly ValidFrom { get; private set; }

    /// <summary>Last day the price applies (inclusive). Null = open-ended.</summary>
    public DateOnly? ValidTo { get; private set; }

    public string? Notes { get; private set; }
    public bool IsActive { get; private set; } = true;

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    private SupplierPriceListItem() { }

    public static SupplierPriceListItem Create(
        Guid supplierId,
        Guid medicineId,
        decimal unitCost,
        decimal? minOrderQuantity,
        DateOnly validFrom,
        DateOnly? validTo,
        string? notes,
        DateTime nowUtc)
    {
        Guard(unitCost, minOrderQuantity, validFrom, validTo);
        return new SupplierPriceListItem
        {
            Id = Guid.CreateVersion7(),
            SupplierId = supplierId,
            MedicineId = medicineId,
            UnitCost = unitCost,
            MinOrderQuantity = minOrderQuantity,
            ValidFrom = validFrom,
            ValidTo = validTo,
            Notes = Clean(notes),
            IsActive = true,
            CreatedAtUtc = nowUtc,
        };
    }

    public void Update(
        Guid medicineId,
        decimal unitCost,
        decimal? minOrderQuantity,
        DateOnly validFrom,
        DateOnly? validTo,
        string? notes,
        DateTime nowUtc)
    {
        Guard(unitCost, minOrderQuantity, validFrom, validTo);
        MedicineId = medicineId;
        UnitCost = unitCost;
        MinOrderQuantity = minOrderQuantity;
        ValidFrom = validFrom;
        ValidTo = validTo;
        Notes = Clean(notes);
        UpdatedAtUtc = nowUtc;
    }

    public void Deactivate(DateTime nowUtc)
    {
        if (!IsActive)
        {
            return;
        }

        IsActive = false;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>Whether the window covers <paramref name="date"/> (both ends inclusive).</summary>
    public bool IsValidOn(DateOnly date) => ValidFrom <= date && (ValidTo is null || ValidTo >= date);

    private static void Guard(decimal unitCost, decimal? minOrderQuantity, DateOnly validFrom, DateOnly? validTo)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(unitCost);
        if (minOrderQuantity <= 0m)
        {
            throw new ArgumentOutOfRangeException(nameof(minOrderQuantity), "The minimum order must be above zero.");
        }

        if (validTo is { } to && to < validFrom)
        {
            throw new ArgumentOutOfRangeException(nameof(validTo), "The price can't end before it starts.");
        }
    }

    private static string? Clean(string? notes) => string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
}
