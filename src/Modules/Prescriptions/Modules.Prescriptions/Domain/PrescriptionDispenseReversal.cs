using FSH.Framework.Core.Domain;

namespace FSH.Modules.Prescriptions.Domain;

/// <summary>What undid a sale's dispense against a prescription item.</summary>
public enum DispenseReversalSource
{
    /// <summary>The whole sale was cancelled.</summary>
    SaleCancelled = 0,

    /// <summary>Some or all of the medicine was returned.</summary>
    SaleReturn = 1,
}

/// <summary>
/// Audit row for quantity given back to a prescription item because the sale that dispensed it was
/// cancelled or (partly) returned. One row per (source document, item); the unique index on
/// (<see cref="SourceId"/>, <see cref="PrescriptionItemId"/>) makes a redelivered event a no-op.
/// Inserted directly through its own DbSet (not a navigation collection).
/// </summary>
public sealed class PrescriptionDispenseReversal : BaseEntity<Guid>
{
    public Guid PrescriptionId { get; private set; }
    public Guid PrescriptionItemId { get; private set; }
    public Guid MedicineId { get; private set; }

    /// <summary>The sale whose dispense is being reversed.</summary>
    public Guid SaleId { get; private set; }

    public DispenseReversalSource Source { get; private set; }

    /// <summary>The cancelled sale's id, or the return's id.</summary>
    public Guid SourceId { get; private set; }

    public decimal Quantity { get; private set; }

    /// <summary>True when this reversal also gave back a completed fill (the item dropped below a whole
    /// multiple of its prescribed quantity).</summary>
    public bool FillRestored { get; private set; }

    public DateTime ReversedAtUtc { get; private set; }

    private PrescriptionDispenseReversal() { }

    internal static PrescriptionDispenseReversal Create(
        PrescriptionItem item, Guid saleId, DispenseReversalSource source, Guid sourceId, decimal quantity,
        bool fillRestored, DateTime reversedAtUtc) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            PrescriptionId = item.PrescriptionId,
            PrescriptionItemId = item.Id,
            MedicineId = item.MedicineId,
            SaleId = saleId,
            Source = source,
            SourceId = sourceId,
            Quantity = quantity,
            FillRestored = fillRestored,
            ReversedAtUtc = reversedAtUtc,
        };
}
