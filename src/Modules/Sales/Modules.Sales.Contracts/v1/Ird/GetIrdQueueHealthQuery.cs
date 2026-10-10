using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Ird;

/// <summary>
/// .NET port of the Next.js reference's <c>getSystemHealthForTenant</c> (system-diagnostics-service.ts),
/// which is what the Next.js app's generically-named <c>/api/system-health</c> route actually returns:
/// IRD invoice queue pending/failed counts, up to 5 recent failed queue rows, and the count of Sales
/// currently flagged <c>ird_status = 'failed'</c>. Generic infra liveness/readiness is a separate,
/// already-ported concern (the framework's <c>/health/live</c>/<c>/health/ready</c>, via
/// <c>MapHeroHealthEndpoints</c>/<c>UseHeroPlatform</c>) — this query is IRD-specific, not a duplicate
/// of that.
/// </summary>
public sealed record GetIrdQueueHealthQuery : IQuery<IrdQueueHealthDto>;
