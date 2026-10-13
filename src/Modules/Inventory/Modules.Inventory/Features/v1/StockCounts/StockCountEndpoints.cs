using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.StockCounts;

/// <summary>
/// Physical stock count sessions. Reading needs Batches.View; everything that moves a count along (and,
/// on posting, stock and the books) needs Batches.AdjustStock — the permission of a single-lot correction.
/// </summary>
public static class StockCountEndpoints
{
    internal static void MapStockCountEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/stock-counts",
                async (CreateStockCountSessionCommand body, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(body, ct)))
            .WithName("CreateStockCountSession")
            .WithSummary("Create a draft stock count for the current branch (all lots, or one category / rack / supplier)")
            .RequirePermission(InventoryPermissions.Batches.AdjustStock)
            .WithIdempotency();

        endpoints.MapPost("/stock-counts/{sessionId:guid}/start",
                async (Guid sessionId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new StartStockCountSessionCommand(sessionId), ct)))
            .WithName("StartStockCountSession")
            .WithSummary("Snapshot system quantities and start counting")
            .RequirePermission(InventoryPermissions.Batches.AdjustStock);

        endpoints.MapPost("/stock-counts/{sessionId:guid}/counts",
                async (Guid sessionId, RecordStockCountsCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { SessionId = sessionId }, ct));
                })
            .WithName("RecordStockCounts")
            .WithSummary("Record counted quantities (or add a found lot)")
            .RequirePermission(InventoryPermissions.Batches.AdjustStock);

        endpoints.MapPost("/stock-counts/{sessionId:guid}/status",
                async (Guid sessionId, ChangeStockCountStatusCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { SessionId = sessionId }, ct));
                })
            .WithName("ChangeStockCountStatus")
            .WithSummary("Submit a count for review, reopen counting, or cancel it")
            .RequirePermission(InventoryPermissions.Batches.AdjustStock);

        endpoints.MapPost("/stock-counts/{sessionId:guid}/post",
                async (Guid sessionId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new PostStockCountSessionCommand(sessionId), ct)))
            .WithName("PostStockCountSession")
            .WithSummary("Apply the count's variances to stock and post the gain / loss")
            .RequirePermission(InventoryPermissions.Batches.AdjustStock)
            .WithIdempotency();

        endpoints.MapGet("/stock-counts/{sessionId:guid}",
                async (Guid sessionId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetStockCountSessionByIdQuery(sessionId), ct)))
            .WithName("GetStockCountSessionById")
            .WithSummary("A stock count with each lot's variance")
            .RequirePermission(InventoryPermissions.Batches.View);

        endpoints.MapGet("/stock-counts",
                async ([AsParameters] SearchStockCountSessionsQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("SearchStockCountSessions")
            .WithSummary("List stock counts")
            .RequirePermission(InventoryPermissions.Batches.View);
    }
}
