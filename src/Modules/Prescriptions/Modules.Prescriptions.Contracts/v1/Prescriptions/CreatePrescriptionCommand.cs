using Mediator;

namespace FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

public sealed record CreatePrescriptionCommand(
    Guid CustomerId,
    string DoctorName,
    DateOnly PrescriptionDate,
    DateOnly ExpiryDate,
    IReadOnlyList<PrescriptionItemInput> Items,
    string? Notes = null) : ICommand<Guid>;
