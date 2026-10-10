using FSH.Modules.Prescriptions.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Prescriptions.Contracts.v1.Reports;

/// <summary>Prescription counts by derived fill status (total/pending/partially-filled/filled/cancelled).</summary>
public sealed record GetPrescriptionStatsQuery : IQuery<PrescriptionStatsDto>;
