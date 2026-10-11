using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Auditing.Contracts.Authorization;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.Reports.GetEntityAuditLogs;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Auditing.Features.v1.Reports.GetEntityAuditLogs;

public static class GetEntityAuditLogsEndpoint
{
    internal static RouteHandlerBuilder MapGetEntityAuditLogsEndpoint(this IEndpointRouteBuilder group)
    {
        return group.MapGet(
                "/entity-logs",
                async ([AsParameters] GetEntityAuditLogsQuery query, IMediator mediator, CancellationToken cancellationToken) =>
                    TypedResults.Ok(await mediator.Send(query, cancellationToken)))
            .WithName("GetEntityAuditLogs")
            .WithSummary("List tenant-scoped entity-change audit logs")
            .WithDescription("Paginated table_name/action-filterable audit log listing (INSERT/UPDATE/DELETE row-level changes).")
            .RequirePermission(AuditingPermissions.AuditTrails.View)
            .Produces<PagedResponse<EntityAuditLogDto>>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden);
    }
}
