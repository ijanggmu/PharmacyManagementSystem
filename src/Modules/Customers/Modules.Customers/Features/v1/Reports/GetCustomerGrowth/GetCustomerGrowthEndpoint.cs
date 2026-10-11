using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Reports.GetCustomerGrowth;

public static class GetCustomerGrowthEndpoint
{
    internal static RouteHandlerBuilder MapGetCustomerGrowthEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/customers/reports/growth",
                (DateTime fromUtc, DateTime toUtc, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetCustomerGrowthQuery(fromUtc, toUtc), ct))
            .WithName("GetCustomerGrowth")
            .WithSummary("New customers per calendar month over a date range, whole-period")
            .RequirePermission(CustomersPermissions.Customers.View);
    }
}
