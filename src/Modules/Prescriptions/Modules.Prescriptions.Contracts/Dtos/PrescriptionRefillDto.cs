namespace FSH.Modules.Prescriptions.Contracts.Dtos;

public sealed record PrescriptionRefillDto(
    Guid Id,
    Guid PrescriptionId,
    string? PrescriptionNumber,
    Guid CustomerId,
    string? CustomerName,
    Guid PrescriptionItemId,
    Guid MedicineId,
    string? MedicineName,
    decimal QuantityDispensed,
    DateTime RefilledAtUtc,
    Guid? DispensedByUserId,
    string? Notes);
