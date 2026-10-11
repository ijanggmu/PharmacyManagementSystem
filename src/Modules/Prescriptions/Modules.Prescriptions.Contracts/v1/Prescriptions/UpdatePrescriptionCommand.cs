using Mediator;

namespace FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

/// <summary>
/// Merges the supplied header fields into the prescription. Null keeps the stored value.
/// <see cref="ClearNotes"/> is the explicit way to remove notes. <see cref="Items"/> updates the dosage
/// directions of existing items; null leaves all items unchanged.
/// </summary>
public sealed record UpdatePrescriptionCommand(
    Guid PrescriptionId,
    string? DoctorName = null,
    DateOnly? ExpiryDate = null,
    string? Notes = null,
    bool ClearNotes = false,
    IReadOnlyList<PrescriptionItemDosageUpdate>? Items = null) : ICommand<Guid>;
