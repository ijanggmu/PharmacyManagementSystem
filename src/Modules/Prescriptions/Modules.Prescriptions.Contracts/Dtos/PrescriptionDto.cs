namespace FSH.Modules.Prescriptions.Contracts.Dtos;

/// <summary>
/// One prescribed medicine. <see cref="PrescribedQuantity"/> is per fill; the item authorizes
/// <see cref="FillsAllowed"/> (1 + <see cref="RefillsAllowed"/>) fills. <see cref="RefillsUsed"/> counts completed
/// fills (floor(dispensed / prescribed)); <see cref="RemainingInCurrentFill"/> is the most the next dispense can
/// take and <see cref="TotalRemainingQuantity"/> what is left across all fills.
/// </summary>
public sealed record PrescriptionItemDto(
    Guid Id,
    Guid MedicineId,
    string? MedicineName,
    decimal PrescribedQuantity,
    decimal DispensedQuantity,
    int RefillsAllowed,
    int RefillsUsed,
    string? DosageInstructions = null,
    int FillsAllowed = 1,
    decimal RemainingInCurrentFill = 0m,
    decimal TotalRemainingQuantity = 0m,
    decimal TotalAuthorizedQuantity = 0m);

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
    string? PrescriptionNumber = null,
    string? DoctorLicenseNumber = null);
