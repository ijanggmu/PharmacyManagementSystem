using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Sales.SearchSales;

public static class SearchSalesEndpoint
{
    internal static RouteHandlerBuilder MapSearchSalesEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("",
                ([AsParameters] SearchSalesRequest request, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(request.ToQuery(), ct))
            .WithName("SearchSales")
            .WithSummary("Search sales (paged; filter by customer/status/date/payment status and method/amount/text; sortable)")
            .RequirePermission(SalesPermissions.Sales.View);
    }
}

/// <summary>Query-string shape of GET /sales. <c>PaymentStatuses</c> and <c>PaymentMethods</c> are
/// comma-separated lists; <c>FromDate</c>/<c>ToDate</c> are whole Nepal-time days (yyyy-MM-dd).</summary>
public sealed record SearchSalesRequest(
    Guid? CustomerId = null,
    string? Status = null,
    DateTime? DateFromUtc = null,
    DateTime? DateToUtc = null,
    Guid? BranchId = null,
    int? PageNumber = null,
    int? PageSize = null,
    Guid? CashierUserId = null,
    bool? OnlyWithBalanceDue = null,
    string? Search = null,
    string? PaymentStatuses = null,
    string? PaymentMethods = null,
    decimal? MinAmount = null,
    decimal? MaxAmount = null,
    string? SortBy = null,
    string? SortOrder = null,
    DateOnly? FromDate = null,
    DateOnly? ToDate = null,
    Guid? MedicineId = null)
{
    internal SearchSalesQuery ToQuery() =>
        new(
            CustomerId, Status, DateFromUtc, DateToUtc, BranchId,
            PageNumber is null or 0 ? 1 : PageNumber.Value,
            PageSize is null or 0 ? 50 : PageSize.Value,
            CashierUserId,
            OnlyWithBalanceDue ?? false,
            Search,
            SplitList(PaymentStatuses),
            SplitList(PaymentMethods),
            MinAmount,
            MaxAmount,
            SortBy,
            SortOrder,
            FromDate,
            ToDate,
            MedicineId);

    private static IReadOnlyList<string>? SplitList(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? null
            : value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
