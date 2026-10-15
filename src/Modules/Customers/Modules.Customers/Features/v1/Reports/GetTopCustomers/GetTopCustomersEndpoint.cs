using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Reports;
using FSH.Modules.Customers.Services;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Reports.GetTopCustomers;

public static class GetTopCustomersEndpoint
{
    internal static RouteHandlerBuilder MapGetTopCustomersEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/customers/reports/top-spenders",
                async (DateTime fromUtc, DateTime toUtc, int? take, IMediator mediator, ICustomerFinancialsAccess financials, CancellationToken ct) =>
                    CustomerFinancialsRedaction.Apply(
                        await mediator.Send(new GetTopCustomersQuery(fromUtc, toUtc, take ?? 10), ct),
                        await financials.CanViewAsync(ct)))
            .WithName("GetTopCustomers")
            .WithSummary("Top customers by total spend over a date range, whole-period")
            .RequirePermission(CustomersPermissions.Customers.View);
    }
}
