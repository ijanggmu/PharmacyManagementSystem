using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Returns;

/// <summary>No filters — mirrors the Next.js <c>GET /api/returns/stats</c> route, which aggregates
/// across all of the tenant's returns.</summary>
public sealed record GetReturnsStatsQuery(Guid? BranchId = null) : IQuery<ReturnsStatsDto>;
