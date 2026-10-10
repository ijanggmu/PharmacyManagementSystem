using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetCustomerLedger;

public static class GetCustomerLedgerEndpoint
{
    internal static RouteHandlerBuilder MapGetCustomerLedgerEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/customers/{customerId:guid}/ledger",
                (Guid customerId, int? pageNumber, int? pageSize, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new GetCustomerLedgerQuery(
                            customerId,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            branchId),
                        ct))
            .WithName("GetCustomerLedger")
            .WithSummary("Get a customer's ledger entries (paged, newest first)")
            .RequirePermission(CustomersPermissions.Ledger.View);
    }
}
