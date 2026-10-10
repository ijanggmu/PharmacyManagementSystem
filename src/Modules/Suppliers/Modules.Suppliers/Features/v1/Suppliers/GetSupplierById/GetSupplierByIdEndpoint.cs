using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.GetSupplierById;

public static class GetSupplierByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetSupplierByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/suppliers/{supplierId:guid}",
                (Guid supplierId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetSupplierByIdQuery(supplierId), ct))
            .WithName("GetSupplierById")
            .WithSummary("Get a supplier by id")
            .RequirePermission(SuppliersPermissions.Suppliers.View);
    }
}
