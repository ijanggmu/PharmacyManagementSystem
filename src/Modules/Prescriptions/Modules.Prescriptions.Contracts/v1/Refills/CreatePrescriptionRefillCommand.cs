using FSH.Modules.Prescriptions.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Prescriptions.Contracts.v1.Refills;

/// <summary>Records a fill/refill against one item of <paramref name="PrescriptionId"/>. Runs through the
/// same safety rule <c>DispensingSafetyPolicy</c> applies to a sale-driven dispense (valid, non-expired,
/// non-cancelled prescription; refills remaining; quantity remaining).</summary>
public sealed record CreatePrescriptionRefillCommand(
    Guid PrescriptionId,
    Guid MedicineId,
    decimal QuantityDispensed,
    string? Notes = null) : ICommand<PrescriptionRefillDto>;
