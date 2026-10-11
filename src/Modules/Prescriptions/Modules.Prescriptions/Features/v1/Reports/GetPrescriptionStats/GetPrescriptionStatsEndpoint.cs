using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Prescriptions.Features.v1.Reports.GetPrescriptionStats;

public static class GetPrescriptionStatsEndpoint
{
    internal static RouteHandlerBuilder MapGetPrescriptionStatsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/stats",
                (IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetPrescriptionStatsQuery(), ct))
            .WithName("GetPrescriptionStats")
            .WithSummary("Prescription counts by derived fill status (total/pending/partially-filled/filled/cancelled)")
            .RequirePermission(PrescriptionsPermissions.Reports.View);
    }
}
