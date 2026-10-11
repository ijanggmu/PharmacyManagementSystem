using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Returns;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Returns.SearchReturns;

public static class SearchReturnsEndpoint
{
    internal static RouteHandlerBuilder MapSearchReturnsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/returns",
                ([AsParameters] SearchReturnsRequest request, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(request.ToQuery(), ct))
            .WithName("SearchReturns")
            .WithSummary("Search customer returns (paged; filter by customer/sale/status/date/amount/text; sortable)")
            .RequirePermission(SalesPermissions.Returns.View);
    }
}

/// <summary>Query-string shape of GET /sales/returns. <c>FromDate</c>/<c>ToDate</c> are whole Nepal-time days (yyyy-MM-dd).</summary>
public sealed record SearchReturnsRequest(
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
    internal SearchReturnsQuery ToQuery() =>
        new(
            CustomerId, SaleId, Status, DateFromUtc, DateToUtc, MinAmount, MaxAmount, BranchId,
            PageNumber is null or 0 ? 1 : PageNumber.Value,
            PageSize is null or 0 ? 50 : PageSize.Value,
            Search, SortBy, SortOrder, FromDate, ToDate);
}
