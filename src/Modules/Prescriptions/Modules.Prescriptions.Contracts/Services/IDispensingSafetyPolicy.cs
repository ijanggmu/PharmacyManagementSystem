namespace FSH.Modules.Prescriptions.Contracts.Services;

public sealed record DispenseCheckLine(Guid MedicineId, decimal Quantity);

/// <summary>
/// The cross-module surface Sales calls BEFORE opening its transaction (root plan §6.2) — a
/// rejected sale must never touch stock or accounting. Implemented by
/// <c>Modules.Prescriptions</c>'s runtime; a caller only needs a reference to this Contracts
/// project.
/// </summary>
public interface IDispensingSafetyPolicy
{
    /// <summary>
    /// Throws <c>DispensingSafetyException</c> (409) if any line's medicine is controlled or
    /// prescription-required and either <paramref name="prescriptionId"/> is null, or the referenced prescription isn't for
    /// <paramref name="customerId"/>, is expired/cancelled, or doesn't have enough remaining
    /// prescribed quantity for that medicine.
    /// </summary>
    ValueTask EnsureDispensableAsync(
        IReadOnlyList<DispenseCheckLine> lines, Guid? prescriptionId, Guid customerId,
        CancellationToken cancellationToken = default);

    /// <summary>Records the dispensed quantity/refill against the prescription — called by Sales
    /// AFTER a sale referencing <paramref name="prescriptionId"/> succeeds.</summary>
    ValueTask RecordDispenseAsync(
        Guid prescriptionId, IReadOnlyList<DispenseCheckLine> lines, CancellationToken cancellationToken = default);
}
