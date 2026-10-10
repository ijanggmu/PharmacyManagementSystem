using Mediator;

namespace FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

public sealed record DeletePrescriptionCommand(Guid PrescriptionId) : ICommand<Guid>;
