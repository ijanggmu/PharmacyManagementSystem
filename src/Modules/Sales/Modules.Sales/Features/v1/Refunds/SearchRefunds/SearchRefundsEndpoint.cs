using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Refunds.SearchRefunds;

public static class SearchRefundsEndpoint
{
    internal static RouteHandlerBuilder MapSearchRefundsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/refunds",
                ([AsParameters] SearchRefundsRequest request, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(request.ToQuery(), ct))
            .WithName("SearchRefunds")
            .WithSummary("Search refunds (paged; filter by customer/sale/status/date/amount/text; sortable)")
            .RequirePermission(SalesPermissions.Refunds.View);
    }
}

/// <summary>Query-string shape of GET /sales/refunds. <c>FromDate</c>/<c>ToDate</c> are whole Nepal-time days (yyyy-MM-dd).</summary>
public sealed record SearchRefundsRequest(
    Guid? CustomerId = null,
    Guid? SaleId = null,
    string? Status = null,
    DateTime? DateFromUtc = null,
    DateTime? DateToUtc = null,
    decimal? MinAmount = null,
    decimal? MaxAmount = null,
    Guid? BranchId = null,
    int? PageNumber = null,
    int? PageSize = null,
    string? Search = null,
    string? SortBy = null,
    string? SortOrder = null,
    DateOnly? FromDate = null,
    DateOnly? ToDate = null)
{
    internal SearchRefundsQuery ToQuery() =>
        new(
            CustomerId, SaleId, Status, DateFromUtc, DateToUtc, MinAmount, MaxAmount, BranchId,
            PageNumber is null or 0 ? 1 : PageNumber.Value,
            PageSize is null or 0 ? 50 : PageSize.Value,
            Search, SortBy, SortOrder, FromDate, ToDate);
}
