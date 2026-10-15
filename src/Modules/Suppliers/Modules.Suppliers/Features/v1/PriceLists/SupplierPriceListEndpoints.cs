using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.PriceLists;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.PriceLists;

/// <summary>
/// Supplier price lists: the agreed purchase price per medicine, used to prefill purchase orders. Reading needs
/// PriceLists.View; adding, editing and removing a row needs PriceLists.Manage.
/// </summary>
public static class SupplierPriceListEndpoints
{
    private static readonly TimeSpan NepalOffset = new(5, 45, 0);

    internal static void MapSupplierPriceListEndpoints(this IEndpointRouteBuilder endpoints)
    {
        // Literal /suppliers/price-lists/lookup before /suppliers/{id:guid}.
        endpoints.MapGet("/suppliers/price-lists/lookup",
                async (Guid supplierId, Guid[]? medicineIds, DateOnly? asOf, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(
                        new GetSupplierPricesQuery(supplierId, medicineIds ?? [], asOf ?? NepalToday()), ct)))
            .WithName("GetSupplierPrices")
            .WithSummary("The supplier's agreed price (per base unit) valid on a date for each medicine asked for")
            .RequirePermission(SuppliersPermissions.PriceLists.View);

        endpoints.MapGet("/suppliers/{supplierId:guid}/price-list",
                async (Guid supplierId, Guid? medicineId, DateOnly? activeOn, bool? includeInactive,
                        int? pageNumber, int? pageSize, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(
                        new SearchSupplierPriceListQuery(
                            supplierId, medicineId, activeOn, includeInactive ?? false,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value),
                        ct)))
            .WithName("SearchSupplierPriceList")
            .WithSummary("A supplier's price list (paged)")
            .RequirePermission(SuppliersPermissions.PriceLists.View);

        endpoints.MapPut("/suppliers/{supplierId:guid}/price-list",
                async (Guid supplierId, UpsertSupplierPriceListItemCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { SupplierId = supplierId }, ct));
                })
            .WithName("UpsertSupplierPriceListItem")
            .WithSummary("Add a price-list row, or update one (itemId in the body)")
            .RequirePermission(SuppliersPermissions.PriceLists.Manage)
            .WithIdempotency();

        endpoints.MapDelete("/suppliers/{supplierId:guid}/price-list/{itemId:guid}",
                async (Guid supplierId, Guid itemId, IMediator mediator, CancellationToken ct) =>
                {
                    await mediator.Send(new DeleteSupplierPriceListItemCommand(supplierId, itemId), ct);
                    return Results.NoContent();
                })
            .WithName("DeleteSupplierPriceListItem")
            .WithSummary("Remove (deactivate) a price-list row")
            .RequirePermission(SuppliersPermissions.PriceLists.Manage)
            .WithIdempotency();
    }

    private static DateOnly NepalToday() => DateOnly.FromDateTime(DateTime.UtcNow + NepalOffset);
}
