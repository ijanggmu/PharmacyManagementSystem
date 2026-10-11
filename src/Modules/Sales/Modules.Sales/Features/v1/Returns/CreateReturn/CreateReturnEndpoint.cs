using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Returns;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Returns.CreateReturn;

public static class CreateReturnEndpoint
{
    internal static RouteHandlerBuilder MapCreateReturnEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/returns",
                async (CreateReturnCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateReturn")
            .WithSummary("Create a customer return against a sale: caps quantity against what was sold, restores stock and posts the reversing voucher if created completed")
            .RequirePermission(SalesPermissions.Returns.Create)
            .WithIdempotency();
    }
}
