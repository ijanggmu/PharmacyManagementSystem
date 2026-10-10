using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Returns;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Returns.UpdateReturnStatus;

public static class UpdateReturnStatusEndpoint
{
    internal static RouteHandlerBuilder MapUpdateReturnStatusEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/returns/{returnId:guid}",
                async (Guid returnId, UpdateReturnStatusCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { ReturnId = returnId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("UpdateReturnStatus")
            .WithSummary("Update a return's status/reason/notes; completing restores stock and posts the reversing voucher exactly once")
            .RequirePermission(SalesPermissions.Returns.Update);
    }
}
