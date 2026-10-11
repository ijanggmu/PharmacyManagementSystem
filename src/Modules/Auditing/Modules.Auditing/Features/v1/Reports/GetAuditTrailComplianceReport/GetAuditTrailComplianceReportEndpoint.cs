using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Auditing.Contracts.Authorization;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.Reports.GetAuditTrailComplianceReport;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Auditing.Features.v1.Reports.GetAuditTrailComplianceReport;

public static class GetAuditTrailComplianceReportEndpoint
{
    internal static RouteHandlerBuilder MapGetAuditTrailComplianceReportEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/audit-trail-compliance",
                (DateTime? fromUtc, DateTime? toUtc, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetAuditTrailComplianceReportQuery(fromUtc, toUtc), ct))
            .WithName("GetAuditTrailComplianceReport")
            .WithSummary("Compliance report — recent entity-change audit trail grouped by action")
            .RequirePermission(AuditingPermissions.AuditTrails.View)
            .Produces<AuditTrailComplianceReportDto>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden);
    }
}
