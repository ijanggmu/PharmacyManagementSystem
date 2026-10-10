using FSH.Modules.Prescriptions.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

public sealed record GetPrescriptionByIdQuery(Guid PrescriptionId) : IQuery<PrescriptionDto>;
