using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.PriceLevels;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.PriceLevels;

/// <summary>Request bodies whose route supplies the id.</summary>
public sealed record UpdatePriceLevelRequest(string Name, decimal DiscountPercent, string? Description = null, bool IsActive = true);

public sealed record SetPriceLevelItemRequest(decimal? UnitPrice);

public sealed record AssignCustomerPriceLevelRequest(Guid? PriceLevelId);

public static class PriceLevelEndpoints
{
    internal static void MapPriceLevelEndpoints(this IEndpointRouteBuilder endpoints)
    {
        // Literal /price-levels/quote before /price-levels/{id:guid}.
        endpoints.MapPost("/price-levels/quote",
                async (GetPriceQuoteQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("GetPriceQuote")
            .WithSummary("The price level a cart is priced at (the customer's own, or the one asked for) and its explicit prices")
            .RequirePermission(SalesPermissions.Sales.View);

        endpoints.MapGet("/price-levels",
                async (bool? includeInactive, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetPriceLevelsQuery(includeInactive ?? false), ct)))
            .WithName("GetPriceLevels")
            .WithSummary("List price levels (retail is implicit and not listed)")
            .RequirePermission(SalesPermissions.Sales.View);

        endpoints.MapGet("/price-levels/{id:guid}",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetPriceLevelByIdQuery(id), ct)))
            .WithName("GetPriceLevelById")
            .WithSummary("Get a price level with its explicit per-medicine prices")
            .RequirePermission(SalesPermissions.Sales.View);

        endpoints.MapPost("/price-levels",
                async (CreatePriceLevelCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreatePriceLevel")
            .WithSummary("Create a price level (e.g. Wholesale = 10% below the lot price)")
            .RequirePermission(SalesPermissions.PriceLevels.Manage);

        endpoints.MapPut("/price-levels/{id:guid}",
                async (Guid id, UpdatePriceLevelRequest request, IMediator mediator, CancellationToken ct) =>
                {
                    await mediator.Send(
                        new UpdatePriceLevelCommand(id, request.Name, request.DiscountPercent, request.Description, request.IsActive), ct);
                    return Results.NoContent();
                })
            .WithName("UpdatePriceLevel")
            .WithSummary("Rename, re-percent or (de)activate a price level")
            .RequirePermission(SalesPermissions.PriceLevels.Manage);

        endpoints.MapPut("/price-levels/{id:guid}/items/{medicineId:guid}",
                async (Guid id, Guid medicineId, SetPriceLevelItemRequest request, IMediator mediator, CancellationToken ct) =>
                {
                    await mediator.Send(new SetPriceLevelItemCommand(id, medicineId, request.UnitPrice), ct);
                    return Results.NoContent();
                })
            .WithName("SetPriceLevelItem")
            .WithSummary("Set (or with a null price, remove) a medicine's explicit price per base unit on a level")
            .RequirePermission(SalesPermissions.PriceLevels.Manage);

        endpoints.MapPut("/price-levels/customers/{customerId:guid}",
                async (Guid customerId, AssignCustomerPriceLevelRequest request, IMediator mediator, CancellationToken ct) =>
                {
                    await mediator.Send(new AssignCustomerPriceLevelCommand(customerId, request.PriceLevelId), ct);
                    return Results.NoContent();
                })
            .WithName("AssignCustomerPriceLevel")
            .WithSummary("Put a customer on a price level, or back on retail with a null level")
            .RequirePermission(SalesPermissions.PriceLevels.Manage);
    }
}
