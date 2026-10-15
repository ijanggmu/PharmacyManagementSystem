using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetCustomerStatement;

public static class GetCustomerStatementEndpoint
{
    internal static RouteHandlerBuilder MapGetCustomerStatementEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/customers/{customerId:guid}/statement",
                (Guid customerId, DateTime fromUtc, DateTime toUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetCustomerStatementQuery(customerId, fromUtc, toUtc, branchId), ct))
            .WithName("GetCustomerStatement")
            .WithSummary("Get a customer's AR statement (opening/closing balance, lines, totals and ageing) over a date range")
            .RequirePermission(CustomersPermissions.Ledger.View);
    }
}
