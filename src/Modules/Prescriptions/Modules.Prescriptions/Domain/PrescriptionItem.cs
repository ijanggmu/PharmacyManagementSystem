using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Prescriptions.Domain;

/// <summary>
/// Reached ONLY through <see cref="Prescription"/>'s navigation collection — needs
/// <c>ValueGeneratedNever()</c> in its EF config (database.md nav-child footgun).
/// </summary>
public sealed class PrescriptionItem : BaseEntity<Guid>
{
    public Guid PrescriptionId { get; private set; }
    public Guid MedicineId { get; private set; }
    public decimal PrescribedQuantity { get; private set; }
    public decimal DispensedQuantity { get; private set; }

    /// <summary>Additional fills beyond the first, e.g. 2 == three total dispenses allowed.</summary>
    public int RefillsAllowed { get; private set; }
    public int RefillsUsed { get; private set; }

    /// <summary>Free-text dosage directions (legacy prescription_items.dosage_instructions). Max 1000 characters.</summary>
    public string? DosageInstructions { get; private set; }

    public decimal RemainingQuantity => PrescribedQuantity - DispensedQuantity;

    /// <summary>
    /// Optimistic-concurrency token (Postgres <c>xmin</c>): a direct refill and a sale dispensing the same
    /// item can't both write from the same stale <see cref="DispensedQuantity"/>/<see cref="RefillsUsed"/>.
    /// Writers also lock the item rows first (<c>PrescriptionItemLocks</c>).
    /// </summary>
    public uint RowVersion { get; }

    private PrescriptionItem() { }

    internal static PrescriptionItem Create(
        Guid medicineId, decimal prescribedQuantity, int refillsAllowed, string? dosageInstructions = null)
    {
        if (prescribedQuantity <= 0)
        {
            throw new CustomException(
                "Prescribed quantity must be positive.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (refillsAllowed < 0)
        {
            throw new CustomException(
                "Refills allowed cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        return new PrescriptionItem
        {
            Id = Guid.CreateVersion7(),
            MedicineId = medicineId,
            PrescribedQuantity = prescribedQuantity,
            RefillsAllowed = refillsAllowed,
            DosageInstructions = string.IsNullOrWhiteSpace(dosageInstructions) ? null : dosageInstructions.Trim(),
        };
    }

    internal void AssignPrescription(Guid prescriptionId) => PrescriptionId = prescriptionId;

    internal void UpdateDosageInstructions(string? dosageInstructions) =>
        DosageInstructions = string.IsNullOrWhiteSpace(dosageInstructions) ? null : dosageInstructions.Trim();

    /// <summary>Each call consumes one fill/refill slot (capped at RefillsAllowed + 1 total) and
    /// the requested quantity (capped at PrescribedQuantity total across all dispenses).</summary>
    internal void RecordDispense(decimal quantity)
    {
        if (quantity <= 0)
        {
            throw new CustomException(
                "Dispense quantity must be positive.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (RefillsUsed >= RefillsAllowed + 1)
        {
            throw new CustomException(
                "No refills remaining on this prescription item.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (quantity > RemainingQuantity)
        {
            throw new CustomException(
                $"Only {RemainingQuantity} remaining on this prescription item, cannot dispense {quantity}.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        DispensedQuantity += quantity;
        RefillsUsed++;
    }

    /// <summary>
    /// Gives back <paramref name="quantity"/> of a dispense that was undone (sale cancelled, medicine
    /// returned). <paramref name="restoreFill"/> also gives back the fill slot the dispense consumed — only
    /// when the whole dispense has now been reversed.
    /// </summary>
    internal void ReverseDispense(decimal quantity, bool restoreFill)
    {
        if (quantity < 0 || quantity > DispensedQuantity)
        {
            throw new CustomException(
                $"Cannot reverse {quantity} on this prescription item; {DispensedQuantity} has been dispensed.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        DispensedQuantity -= quantity;
        if (restoreFill && RefillsUsed > 0)
        {
            RefillsUsed--;
        }
    }
}
