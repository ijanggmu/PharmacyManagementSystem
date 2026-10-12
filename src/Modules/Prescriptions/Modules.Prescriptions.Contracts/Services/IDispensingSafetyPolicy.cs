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

    /// <summary>Records the dispensed quantity/refill against the prescription — called AFTER a sale
    /// referencing <paramref name="prescriptionId"/> succeeds. With <paramref name="saleId"/> the dispense is
    /// recorded per sale: a second call for the same sale is a no-op, and a later cancellation or return of
    /// that sale can give exactly that quantity back. With <paramref name="joinCallerTransaction"/> the write
    /// runs inside the transaction the caller (Sales) opened on the scope's shared connection, with the
    /// prescription row locked: two counters dispensing the same prescription at once are checked one after
    /// the other against what is really left, and the second sale is refused instead of over-dispensing.</summary>
    ValueTask RecordDispenseAsync(
        Guid prescriptionId, IReadOnlyList<DispenseCheckLine> lines, Guid? saleId = null,
        bool joinCallerTransaction = false, CancellationToken cancellationToken = default);
}
