using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Returns;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Returns.GetReturnById;

public static class GetReturnByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetReturnByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/returns/{returnId:guid}",
                (Guid returnId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetReturnByIdQuery(returnId), ct))
            .WithName("GetReturnById")
            .WithSummary("Get a customer return (with items) by id")
            .RequirePermission(SalesPermissions.Returns.View);
    }
}
