using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Prescriptions.Domain;

public enum PrescriptionStatus
{
    Active = 0,
    Cancelled = 1,
}

public sealed class Prescription : AggregateRoot<Guid>
{
    private readonly List<PrescriptionItem> _items = [];
    private readonly List<PrescriptionRefill> _refills = [];

    public Guid CustomerId { get; private set; }

    /// <summary>Human-facing prescription number, "RX-" + per-tenant sequence. Unique per tenant (max 32).</summary>
    public string PrescriptionNumber { get; private set; } = default!;

    public string DoctorName { get; private set; } = default!;
    public DateOnly PrescriptionDate { get; private set; }
    public DateOnly ExpiryDate { get; private set; }
    public PrescriptionStatus Status { get; private set; } = PrescriptionStatus.Active;

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>The authenticated user who created this prescription. Null for prescriptions created
    /// before this was recorded, or by a call with no authenticated user.</summary>
    public Guid? CreatedByUserId { get; private set; }

    public DateTime? CancelledAtUtc { get; private set; }
    public string? CancelReason { get; private set; }

    /// <summary>Free-text notes for the whole prescription (legacy prescriptions.notes). Max 2000 characters.</summary>
    public string? Notes { get; private set; }

    public IReadOnlyList<PrescriptionItem> Items => _items;
    public IReadOnlyList<PrescriptionRefill> Refills => _refills;

    private Prescription() { }

    public static Prescription Create(
        Guid customerId,
        string doctorName,
        DateOnly prescriptionDate,
        DateOnly expiryDate,
        Guid? createdByUserId = null,
        string? notes = null,
        string? prescriptionNumber = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(doctorName);
        if (expiryDate < prescriptionDate)
        {
            throw new CustomException(
                "Expiry date cannot be before the prescription date.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        var id = Guid.CreateVersion7();
        return new Prescription
        {
            Id = id,
            CustomerId = customerId,
            // The create handler reserves a per-tenant sequence number. Callers without one (domain tests) get the
            // same "RX-" + first 8 hex of the id shape that the migration backfills for legacy rows.
            PrescriptionNumber = string.IsNullOrWhiteSpace(prescriptionNumber)
                ? "RX-" + id.ToString()[..8]
                : prescriptionNumber.Trim(),
            DoctorName = doctorName.Trim(),
            PrescriptionDate = prescriptionDate,
            ExpiryDate = expiryDate,
            CreatedAtUtc = DateTime.UtcNow,
            CreatedByUserId = createdByUserId,
            Notes = NormalizeOptional(notes),
        };
    }

    public void AddItem(Guid medicineId, decimal prescribedQuantity, int refillsAllowed, string? dosageInstructions = null)
    {
        if (_items.Any(i => i.MedicineId == medicineId))
        {
            // Dispensing matches a sale line to the prescription by medicine (FindItem), so a duplicate
            // line could never be dispensed against and would only confuse the remaining-quantity check.
            throw new CustomException(
                $"Medicine {medicineId} is already on this prescription. Combine the quantities into one line.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        var item = PrescriptionItem.Create(medicineId, prescribedQuantity, refillsAllowed, dosageInstructions);
        item.AssignPrescription(Id);
        _items.Add(item);
    }

    /// <summary>True once any item has been dispensed. Such prescriptions are audit records and must be
    /// cancelled rather than deleted.</summary>
    public bool HasDispensedItems => _items.Any(i => i.DispensedQuantity > 0);

    /// <summary>
    /// Edits the header fields. Null arguments are left unchanged (merge). <paramref name="clearNotes"/> is the
    /// explicit way to remove stored notes; a null <paramref name="notes"/> alone keeps them.
    /// Cancelled prescriptions are read-only. Once anything has been dispensed the validity may only be
    /// shortened, never extended (the dispensed record is what the doctor authorized). <paramref name="latestAllowedExpiry"/>
    /// (see <see cref="PrescriptionRules.LatestExpiryFor"/>) caps a new expiry date.
    /// </summary>
    public void Update(
        string? doctorName, DateOnly? expiryDate, string? notes = null, bool clearNotes = false,
        DateOnly? latestAllowedExpiry = null)
    {
        if (Status == PrescriptionStatus.Cancelled)
        {
            throw new CustomException(
                "Cancelled prescriptions cannot be edited.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (doctorName is not null)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(doctorName);
            DoctorName = doctorName.Trim();
        }

        if (expiryDate is { } expiry)
        {
            if (expiry < PrescriptionDate)
            {
                throw new CustomException(
                    "Expiry date cannot be before the prescription date.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            if (expiry > ExpiryDate && HasDispensedItems)
            {
                throw new CustomException(
                    "This prescription has already been dispensed against, so its validity cannot be extended " +
                    $"past {ExpiryDate:yyyy-MM-dd}. Ask for a new prescription instead.",
                    (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            }

            if (latestAllowedExpiry is { } latest && expiry > latest && expiry > ExpiryDate)
            {
                throw new CustomException(
                    $"Expiry date cannot be later than {latest:yyyy-MM-dd} for a prescription issued on {PrescriptionDate:yyyy-MM-dd}.",
                    (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            ExpiryDate = expiry;
        }

        if (clearNotes)
        {
            Notes = null;
        }
        else if (notes is not null)
        {
            Notes = NormalizeOptional(notes);
        }
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public void Cancel(string reason)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);

        if (Status == PrescriptionStatus.Cancelled)
        {
            throw new CustomException(
                "Prescription is already cancelled.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Status = PrescriptionStatus.Cancelled;
        CancelledAtUtc = DateTime.UtcNow;
        CancelReason = reason.Trim();
    }

    public bool IsValidAsOf(DateOnly today) => Status == PrescriptionStatus.Active && ExpiryDate >= today;

    /// <summary>
    /// Sets (or clears, when blank) the dosage directions of one item. Cancelled prescriptions are read-only.
    /// </summary>
    public void UpdateItemDosageInstructions(Guid itemId, string? dosageInstructions)
    {
        if (Status == PrescriptionStatus.Cancelled)
        {
            throw new CustomException(
                "Cancelled prescriptions cannot be edited.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var item = _items.FirstOrDefault(i => i.Id == itemId)
            ?? throw new NotFoundException($"Prescription item {itemId} not found.");
        item.UpdateDosageInstructions(dosageInstructions);
    }

    /// <summary>Null if this prescription has no item for the medicine.</summary>
    public PrescriptionItem? FindItem(Guid medicineId) => _items.FirstOrDefault(i => i.MedicineId == medicineId);

    /// <summary>
    /// Records a direct refill against this prescription's item for <paramref name="medicineId"/> — the same
    /// safety rule <see cref="PrescriptionItem.RecordDispense"/> enforces for a sale-driven dispense (refills
    /// remaining, quantity remaining), plus the expiry/cancellation check <c>DispensingSafetyPolicy</c> runs
    /// before a sale is allowed to reference this prescription. Appends a <see cref="PrescriptionRefill"/>
    /// ledger row so each individual fill event (not just the running totals) is kept.
    /// </summary>
    public PrescriptionRefill RecordRefill(
        Guid medicineId, decimal quantity, DateOnly today, DateTime nowUtc, Guid? dispensedByUserId, string? notes = null)
    {
        if (!IsValidAsOf(today))
        {
            throw new CustomException(
                $"Prescription {Id} is expired or cancelled.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var item = FindItem(medicineId)
            ?? throw new CustomException(
                $"Prescription {Id} has no entry for medicine {medicineId}.", (IEnumerable<string>?)null, HttpStatusCode.NotFound);

        item.RecordDispense(quantity);

        var refill = PrescriptionRefill.Create(Id, item.Id, medicineId, quantity, nowUtc, dispensedByUserId, notes);
        _refills.Add(refill);
        return refill;
    }

    /// <summary>
    /// Records the dispense made by sale <paramref name="saleId"/> against this prescription's item for
    /// <paramref name="medicineId"/> (one fill slot + the quantity; <see cref="PrescriptionItem.RecordDispense"/>
    /// enforces the limits) and appends a <see cref="PrescriptionRefill"/> row stamped with the sale, which is
    /// both the audit trail and what a later cancellation/return reverses. Validity (expiry, cancellation,
    /// customer) is the caller's check — see <c>DispensingSafetyPolicy</c>.
    /// </summary>
    public PrescriptionRefill RecordSaleDispense(
        Guid medicineId, decimal quantity, Guid saleId, DateTime nowUtc, Guid? dispensedByUserId)
    {
        var item = FindItem(medicineId)
            ?? throw new CustomException(
                $"Prescription {Id} has no entry for medicine {medicineId}.", (IEnumerable<string>?)null, HttpStatusCode.NotFound);

        item.RecordDispense(quantity);

        var refill = PrescriptionRefill.Create(Id, item.Id, medicineId, quantity, nowUtc, dispensedByUserId, notes: null, saleId: saleId);
        _refills.Add(refill);
        return refill;
    }
}
