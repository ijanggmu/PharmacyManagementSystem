using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Services;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Customers.GetCustomerSummary;

public static class GetCustomerSummaryEndpoint
{
    internal static RouteHandlerBuilder MapGetCustomerSummaryEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/customers/{customerId:guid}/summary",
                async (Guid customerId, Guid? branchId, IMediator mediator, ICustomerFinancialsAccess financials, CancellationToken ct) =>
                    CustomerFinancialsRedaction.Apply(
                        await mediator.Send(new GetCustomerSummaryQuery(customerId, branchId), ct),
                        await financials.CanViewAsync(ct)))
            .WithName("GetCustomerSummary")
            .WithSummary("Purchase count, total spent (completed sales) and prescription count of a customer")
            .RequirePermission(CustomersPermissions.Customers.View);
    }
}
