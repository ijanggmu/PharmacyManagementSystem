using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.ListDirectGoodsReceipts;

public static class ListDirectGoodsReceiptsEndpoint
{
    internal static RouteHandlerBuilder MapListDirectGoodsReceiptsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/direct-goods-receipts",
                (Guid? branchId, int? pageNumber, int? pageSize, string? status, string? search, Guid? supplierId,
                    DateTime? dateFromUtc, DateTime? dateToUtc, string? source, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new ListDirectGoodsReceiptsQuery(
                            branchId,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            status,
                            search,
                            supplierId,
                            dateFromUtc,
                            dateToUtc,
                            source),
                        ct))
            .WithName("ListDirectGoodsReceipts")
            .WithSummary("Goods receipts, newest first (paged; status, source, supplier, date range and free-text search)")
            .RequirePermission(PurchasingPermissions.DirectGoodsReceipts.View);
    }
}
