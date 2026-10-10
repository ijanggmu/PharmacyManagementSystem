using Mediator;

namespace FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

public sealed record CancelPrescriptionCommand(Guid PrescriptionId, string Reason) : ICommand<Guid>;
