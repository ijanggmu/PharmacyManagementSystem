using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Sales.Contracts.Authorization;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Ird.GetIrdQueue;

public static class GetIrdQueueEndpoint
{
    internal static RouteHandlerBuilder MapGetIrdQueueEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/ird/queue",
                async ([AsParameters] GetIrdQueueQuery query, IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(query, ct).ConfigureAwait(false)))
            .WithName("GetIrdQueue")
            .WithSummary("Paged IRD e-invoice dispatch queue")
            .WithDescription("IRD (CBMS) dispatch queue rows — status, attempts, last error, next attempt — for the system Integrations log.")
            .RequirePermission(SalesPermissions.Ird.View)
            .Produces<PagedResponse<IrdQueueItemDto>>(StatusCodes.Status200OK);
    }
}
