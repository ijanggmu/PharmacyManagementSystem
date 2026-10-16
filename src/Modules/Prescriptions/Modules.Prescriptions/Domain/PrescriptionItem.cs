using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Prescriptions.Domain;

/// <summary>
/// Reached ONLY through <see cref="Prescription"/>'s navigation collection — needs
/// <c>ValueGeneratedNever()</c> in its EF config (database.md nav-child footgun).
/// <para>
/// <see cref="PrescribedQuantity"/> is the quantity of ONE fill. The item authorizes
/// <see cref="FillsAllowed"/> (= 1 + <see cref="RefillsAllowed"/>) fills, so the most that can ever be dispensed is
/// <see cref="TotalAuthorizedQuantity"/>. A fill is "used" once a full prescribed quantity has been dispensed
/// (<see cref="FillsUsed"/> = floor(dispensed / prescribed)); the balance of a partly dispensed fill stays
/// dispensable, and no single dispense may run past the end of the current fill (a refill is a separate
/// dispense, never handed out early in one go).
/// </para>
/// </summary>
public sealed class PrescriptionItem : BaseEntity<Guid>
{
    public Guid PrescriptionId { get; private set; }
    public Guid MedicineId { get; private set; }

    /// <summary>Quantity of one fill (what the doctor wrote per dispense).</summary>
    public decimal PrescribedQuantity { get; private set; }

    /// <summary>Total dispensed across all fills.</summary>
    public decimal DispensedQuantity { get; private set; }

    /// <summary>Additional fills beyond the first, e.g. 2 == three total fills allowed.</summary>
    public int RefillsAllowed { get; private set; }

    /// <summary>
    /// Stored mirror of <see cref="FillsUsed"/>, re-derived on every dispense/reversal. Read
    /// <see cref="FillsUsed"/> for decisions: rows written before fills were derived from the quantity counted
    /// one per dispense.
    /// </summary>
    public int RefillsUsed { get; private set; }

    /// <summary>Free-text dosage directions (legacy prescription_items.dosage_instructions). Max 1000 characters.</summary>
    public string? DosageInstructions { get; private set; }

    /// <summary>Number of fills the item authorizes: the first fill plus the refills.</summary>
    public int FillsAllowed => RefillsAllowed + 1;

    /// <summary>The most that can ever be dispensed against this item: prescribed quantity × fills allowed.</summary>
    public decimal TotalAuthorizedQuantity => PrescribedQuantity * FillsAllowed;

    /// <summary>Completed fills: floor(dispensed / prescribed), capped at <see cref="FillsAllowed"/>.</summary>
    public int FillsUsed => PrescribedQuantity <= 0
        ? 0
        : (int)Math.Min(FillsAllowed, Math.Floor(DispensedQuantity / PrescribedQuantity));

    /// <summary>Total still dispensable across the current and all remaining fills.</summary>
    public decimal RemainingQuantity => Math.Max(0m, TotalAuthorizedQuantity - DispensedQuantity);

    /// <summary>What is left of the fill being dispensed now (a fresh fill = the prescribed quantity); 0 when
    /// every fill has been dispensed. The most a single dispense may take.</summary>
    public decimal RemainingInCurrentFill => RemainingQuantity <= 0
        ? 0m
        : Math.Min(RemainingQuantity, PrescribedQuantity - (DispensedQuantity - (FillsUsed * PrescribedQuantity)));

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

    /// <summary>A quantity as the counter reads it ("10", "2.5"), not the stored scale ("10.000").</summary>
    private static string Qty(decimal value) => value.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture);

    /// <summary>
    /// Why <paramref name="quantity"/> cannot be dispensed now, or null when it can: every fill already
    /// dispensed, or more than is left of the current fill. The one rule shared by the domain
    /// (<see cref="RecordDispense"/>) and the sale gate (<c>DispensingSafetyPolicy</c>).
    /// </summary>
    internal string? CannotDispenseReason(decimal quantity)
    {
        if (RemainingQuantity <= 0)
        {
            return $"All {FillsAllowed} fill(s) of {Qty(PrescribedQuantity)} have been dispensed; no refills remaining.";
        }

        decimal currentFill = RemainingInCurrentFill;
        if (quantity > currentFill)
        {
            // Quantities as the counter reads them ("10", "2.5"), not the stored scale ("10.000").
            return $"Only {Qty(currentFill)} left to dispense (fill {FillsUsed + 1} of {FillsAllowed}, " +
                $"{Qty(PrescribedQuantity)} per fill), so {Qty(quantity)} can't be dispensed. Dispense a refill separately.";
        }

        return null;
    }

    /// <summary>Records a dispense of <paramref name="quantity"/>. A fill counts as used once a whole
    /// prescribed quantity has been dispensed, so a partial fill's balance can still be collected later.</summary>
    internal void RecordDispense(decimal quantity)
    {
        if (quantity <= 0)
        {
            throw new CustomException(
                "Dispense quantity must be positive.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (CannotDispenseReason(quantity) is { } reason)
        {
            throw new CustomException(reason, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        DispensedQuantity += quantity;
        RefillsUsed = FillsUsed;
    }

    /// <summary>
    /// Gives back <paramref name="quantity"/> of a dispense that was undone (sale cancelled, medicine
    /// returned). Returns true when this brought a completed fill back (fewer fills used than before).
    /// </summary>
    internal bool ReverseDispense(decimal quantity)
    {
        if (quantity < 0 || quantity > DispensedQuantity)
        {
            throw new CustomException(
                $"Cannot reverse {quantity} on this prescription item; {DispensedQuantity} has been dispensed.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        int fillsBefore = FillsUsed;
        DispensedQuantity -= quantity;
        RefillsUsed = FillsUsed;
        return FillsUsed < fillsBefore;
    }
}
