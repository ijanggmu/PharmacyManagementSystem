using FSH.Modules.Prescriptions.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Prescriptions.Contracts.v1.Refills;

public sealed record GetPrescriptionRefillByIdQuery(Guid RefillId) : IQuery<PrescriptionRefillDto>;
