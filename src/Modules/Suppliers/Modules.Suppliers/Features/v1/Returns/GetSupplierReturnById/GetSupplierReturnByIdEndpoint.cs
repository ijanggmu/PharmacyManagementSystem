using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Returns.GetSupplierReturnById;

public static class GetSupplierReturnByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetSupplierReturnByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/suppliers/returns/{returnId:guid}",
                (Guid returnId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetSupplierReturnByIdQuery(returnId), ct))
            .WithName("GetSupplierReturnById")
            .WithSummary("Get one supplier return by id")
            .RequirePermission(SuppliersPermissions.Returns.View);
    }
}
