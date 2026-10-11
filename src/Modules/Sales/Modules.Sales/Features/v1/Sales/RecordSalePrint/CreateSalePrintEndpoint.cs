using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Sales.RecordSalePrint;

public static class CreateSalePrintEndpoint
{
    internal static RouteHandlerBuilder MapCreateSalePrintEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/{saleId:guid}/prints",
                async (Guid saleId, RecordSalePrintCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { SaleId = saleId }, ct));
                })
            .WithName("RecordSalePrint")
            .WithSummary("Record an invoice print and get its print number (original vs copy)")
            .RequirePermission(SalesPermissions.Sales.View);
    }
}
