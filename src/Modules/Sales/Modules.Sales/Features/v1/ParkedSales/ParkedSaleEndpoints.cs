using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.ParkedSales;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.ParkedSales;

/// <summary>Held ("parked") POS bills at the caller's branch. Gated on selling: whoever can ring up a sale can hold one.</summary>
public static class ParkedSaleEndpoints
{
    internal static void MapParkedSaleEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/parked",
                async (IMediator mediator, CancellationToken ct) => Results.Ok(await mediator.Send(new GetParkedSalesQuery(), ct)))
            .WithName("GetParkedSales")
            .WithSummary("List the held bills at the current branch that have not expired, newest first")
            .RequirePermission(SalesPermissions.Sales.Create);

        endpoints.MapPost("/parked",
                async (ParkSaleCommand command, IMediator mediator, CancellationToken ct) => Results.Ok(await mediator.Send(command, ct)))
            .WithName("ParkSale")
            .WithSummary("Hold the current cart at this branch (no stock or ledger effect); expires after pos.parked_bill_expiry_hours")
            .RequirePermission(SalesPermissions.Sales.Create);

        endpoints.MapPost("/parked/{id:guid}/recall",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new RecallParkedSaleCommand(id), ct)))
            .WithName("RecallParkedSale")
            .WithSummary("Take a held bill off hold and return its cart (404 if another till already recalled it)")
            .RequirePermission(SalesPermissions.Sales.Create);

        endpoints.MapDelete("/parked/{id:guid}",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                {
                    await mediator.Send(new DiscardParkedSaleCommand(id), ct);
                    return Results.NoContent();
                })
            .WithName("DiscardParkedSale")
            .WithSummary("Discard a held bill")
            .RequirePermission(SalesPermissions.Sales.Create);
    }
}
