using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Refunds;

/// <summary>No filters — mirrors the Next.js <c>GET /api/refunds/stats</c> route, which aggregates
/// across all of the tenant's refunds.</summary>
public sealed record GetRefundsStatsQuery(Guid? BranchId = null) : IQuery<RefundsStatsDto>;
