using FSH.Modules.Prescriptions.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Prescriptions.Contracts.v1.Reports;

/// <summary>Active prescriptions with remaining refills, expiring within N days (default 30).</summary>
public sealed record GetRefillsDueQuery(int WithinDays = 30) : IQuery<IReadOnlyList<RefillDueDto>>;
