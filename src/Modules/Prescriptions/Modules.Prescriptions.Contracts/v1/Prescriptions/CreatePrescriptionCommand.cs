using Mediator;

namespace FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

public sealed record CreatePrescriptionCommand(
    Guid CustomerId,
    string DoctorName,
    DateOnly PrescriptionDate,
    DateOnly ExpiryDate,
    IReadOnlyList<PrescriptionItemInput> Items,
    string? Notes = null,
    // The prescriber's NMC registration number. Required when a controlled medicine is on the prescription
    // (it is a column of the DDA narcotic register).
    string? DoctorLicenseNumber = null) : ICommand<Guid>;
