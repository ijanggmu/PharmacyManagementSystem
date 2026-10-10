namespace FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

public sealed record PrescriptionItemInput(
    Guid MedicineId,
    decimal PrescribedQuantity,
    int RefillsAllowed = 0,
    string? DosageInstructions = null);
