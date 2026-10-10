using FSH.Framework.Core.Domain;

namespace FSH.Modules.Prescriptions.Domain;

/// <summary>
/// One row per tenant. Incremented atomically by <c>PrescriptionNumberService</c> via a single
/// <c>UPDATE ... RETURNING</c>, the same counter pattern as <c>AccountingVoucherSequence</c>.
/// </summary>
public sealed class PrescriptionNumberSequence : AggregateRoot<Guid>
{
    public int LastNumber { get; private set; }

    private PrescriptionNumberSequence() { }

    public static PrescriptionNumberSequence CreateForTenant() => new()
    {
        Id = Guid.CreateVersion7(),
        LastNumber = 0,
    };
}
