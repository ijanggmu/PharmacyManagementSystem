using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Returns;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Returns.DeleteReturn;

public static class DeleteReturnEndpoint
{
    internal static RouteHandlerBuilder MapDeleteReturnEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/returns/{returnId:guid}",
                async (Guid returnId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new DeleteReturnCommand(returnId), ct)))
            .WithName("DeleteReturn")
            .WithSummary("Soft-delete a return that has not restored stock (409 once it is completed)")
            .RequirePermission(SalesPermissions.Returns.Update);
    }
}
