using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Prescriptions.Features.v1.Reports.GetRefillsDue;

public static class GetRefillsDueEndpoint
{
    internal static RouteHandlerBuilder MapGetRefillsDueEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/refills-due",
                (int? withinDays, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetRefillsDueQuery(withinDays ?? 30), ct))
            .WithName("GetRefillsDue")
            .WithSummary("Active prescriptions with remaining refills expiring within N days (default 30)")
            .RequirePermission(PrescriptionsPermissions.Reports.View);
    }
}
