using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Sales.GetSaleById;

public static class GetSaleByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetSaleByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/{saleId:guid}",
                (Guid saleId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetSaleByIdQuery(saleId), ct))
            .WithName("GetSaleById")
            .WithSummary("Get a sale (with items) by id")
            .RequirePermission(SalesPermissions.Sales.View);
    }
}
