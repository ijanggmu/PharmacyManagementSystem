using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Sales.CancelSale;

public static class VoidSaleEndpoint
{
    internal static RouteHandlerBuilder MapVoidSaleEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/{saleId:guid}/cancel",
                async (Guid saleId, CancelSaleCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { SaleId = saleId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("VoidSale")
            .WithSummary("Cancel a completed sale: voids the voucher and restocks inventory. Without Sales.Cancel, needs a manager approval token")
            // Anyone who sells may ask; without Sales.Cancel the handler requires a manager approval for this sale.
            .RequirePermission(SalesPermissions.Sales.Create);
    }
}
