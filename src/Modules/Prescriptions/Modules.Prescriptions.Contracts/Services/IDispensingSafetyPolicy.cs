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

    /// <summary>
    /// Consumes the prescription for sale <paramref name="saleId"/>: re-checks every prescription-required
    /// line UNDER A ROW LOCK on the prescription's items and records the dispensed quantity + one fill per
    /// item. Call it INSIDE the sale's transaction (after the sale row is written, before commit): it joins
    /// that transaction through the scope's shared connection, so the consumption commits or rolls back
    /// with the sale, and two concurrent sales against the same prescription serialize — the second one
    /// sees the first one's consumption and is refused with <c>DispensingSafetyException</c> (409).
    /// Idempotent per sale (a retried transaction or the SaleCompleted reconciliation records nothing twice).
    /// The default implementation is a no-op so existing test doubles keep compiling.
    /// </summary>
    ValueTask ConsumeForSaleAsync(
        Guid saleId, Guid? prescriptionId, Guid customerId, IReadOnlyList<DispenseCheckLine> lines,
        CancellationToken cancellationToken = default) => ValueTask.CompletedTask;

    /// <summary>Records the dispensed quantity/refill against the prescription without a sale reference.
    /// Superseded for sales by <see cref="ConsumeForSaleAsync"/>; kept for existing callers.</summary>
    ValueTask RecordDispenseAsync(
        Guid prescriptionId, IReadOnlyList<DispenseCheckLine> lines, CancellationToken cancellationToken = default);
}
