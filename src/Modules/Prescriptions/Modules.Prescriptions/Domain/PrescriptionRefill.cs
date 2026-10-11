using FSH.Framework.Core.Domain;

namespace FSH.Modules.Prescriptions.Domain;

/// <summary>
/// One recorded fill/refill event against a <see cref="PrescriptionItem"/> — the ledger row behind the
/// aggregate counters (<see cref="PrescriptionItem.RefillsUsed"/>/<see cref="PrescriptionItem.DispensedQuantity"/>).
/// Reached ONLY through <see cref="Prescription"/>'s navigation collection — same nav-child footgun as
/// <see cref="PrescriptionItem"/> (needs <c>ValueGeneratedNever()</c> in its EF config; database.md).
/// </summary>
public sealed class PrescriptionRefill : BaseEntity<Guid>
{
    public Guid PrescriptionId { get; private set; }
    public Guid PrescriptionItemId { get; private set; }
    public Guid MedicineId { get; private set; }
    public decimal QuantityDispensed { get; private set; }
    public DateTime RefilledAtUtc { get; private set; }

    /// <summary>The authenticated user who recorded the refill. Null when there was none (e.g. a sale
    /// completed by a background/system caller).</summary>
    public Guid? DispensedByUserId { get; private set; }

    /// <summary>Free-text notes for this specific refill event. Max 1000 characters.</summary>
    public string? Notes { get; private set; }

    /// <summary>The sale that made this dispense; null for a refill recorded directly (not through a sale).
    /// Unique per (sale, item): a sale consumes a prescription item at most once.</summary>
    public Guid? SaleId { get; private set; }

    private PrescriptionRefill() { }

    internal static PrescriptionRefill Create(
        Guid prescriptionId,
        Guid prescriptionItemId,
        Guid medicineId,
        decimal quantityDispensed,
        DateTime refilledAtUtc,
        Guid? dispensedByUserId,
        string? notes,
        Guid? saleId = null) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            PrescriptionId = prescriptionId,
            PrescriptionItemId = prescriptionItemId,
            MedicineId = medicineId,
            QuantityDispensed = quantityDispensed,
            RefilledAtUtc = refilledAtUtc,
            DispensedByUserId = dispensedByUserId,
            Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(),
            SaleId = saleId,
        };
}
