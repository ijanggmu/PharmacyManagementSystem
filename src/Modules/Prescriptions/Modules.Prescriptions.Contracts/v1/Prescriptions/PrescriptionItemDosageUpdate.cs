namespace FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

/// <summary>Dosage directions for one existing prescription item. A null or blank value clears the directions.</summary>
public sealed record PrescriptionItemDosageUpdate(Guid ItemId, string? DosageInstructions);
