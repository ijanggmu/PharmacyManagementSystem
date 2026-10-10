namespace FSH.Modules.Prescriptions.Contracts.Dtos;

public sealed record RefillDueDto(
    Guid PrescriptionId,
    Guid CustomerId,
    string? CustomerName,
    Guid MedicineId,
    string? MedicineName,
    int RefillsAllowed,
    int RefillsUsed,
    int RefillsRemaining,
    DateOnly ExpiryDate);
