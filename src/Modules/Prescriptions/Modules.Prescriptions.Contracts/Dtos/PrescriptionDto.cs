namespace FSH.Modules.Prescriptions.Contracts.Dtos;

public sealed record PrescriptionItemDto(
    Guid Id,
    Guid MedicineId,
    string? MedicineName,
    decimal PrescribedQuantity,
    decimal DispensedQuantity,
    int RefillsAllowed,
    int RefillsUsed,
    string? DosageInstructions = null);

public sealed record PrescriptionDto(
    Guid Id,
    Guid CustomerId,
    string? CustomerName,
    string DoctorName,
    DateOnly PrescriptionDate,
    DateOnly ExpiryDate,
    string Status,
    DateTime CreatedAtUtc,
    DateTime? CancelledAtUtc,
    string? CancelReason,
    IReadOnlyList<PrescriptionItemDto> Items,
    Guid? CreatedByUserId = null,
    string? Notes = null,
    string? PrescriptionNumber = null);
