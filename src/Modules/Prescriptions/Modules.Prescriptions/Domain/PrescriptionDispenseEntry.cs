using FSH.Framework.Core.Domain;

namespace FSH.Modules.Prescriptions.Domain;

/// <summary>
/// Append-only trail of what each sale dispensed against a prescription item, and what was given back
/// later. A <c>Sale</c> entry records the dispense (positive quantity, one refill slot used); a
/// <c>SaleCancel</c> or <c>Return</c> entry records a reversal (negative quantity). The sum per
/// (sale, item) is what that sale still holds, so a reversal can never give back more than the sale took.
/// Unique per (sale, item, reference), so a redelivered event can't record or reverse twice.
/// </summary>
public sealed class PrescriptionDispenseEntry : BaseEntity<Guid>
{
    public const string SaleReference = "Sale";
    public const string SaleCancelReference = "SaleCancel";
    public const string ReturnReference = "Return";

    public Guid SaleId { get; private set; }
    public Guid PrescriptionId { get; private set; }
    public Guid PrescriptionItemId { get; private set; }
    public Guid MedicineId { get; private set; }

    /// <summary>Positive for a dispense, negative for a reversal.</summary>
    public decimal Quantity { get; private set; }

    /// <summary>+1 when the dispense used a refill slot, -1 when a reversal gave it back, else 0.</summary>
    public int RefillDelta { get; private set; }

    public string ReferenceType { get; private set; } = default!;
    public Guid ReferenceId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private PrescriptionDispenseEntry() { }

    public static PrescriptionDispenseEntry Create(
        Guid saleId, Guid prescriptionId, Guid prescriptionItemId, Guid medicineId, decimal quantity, int refillDelta,
        string referenceType, Guid referenceId) => new()
    {
        Id = Guid.CreateVersion7(),
        SaleId = saleId,
        PrescriptionId = prescriptionId,
        PrescriptionItemId = prescriptionItemId,
        MedicineId = medicineId,
        Quantity = quantity,
        RefillDelta = refillDelta,
        ReferenceType = referenceType,
        ReferenceId = referenceId,
        CreatedAtUtc = DateTime.UtcNow,
    };
}
