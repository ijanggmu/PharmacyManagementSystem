using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetReceivablesDue;

public static class GetReceivablesDueEndpoint
{
    internal static RouteHandlerBuilder MapGetReceivablesDueEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/receivables-due",
                (DateTime? asOfUtc, int? withinDays, Guid? branchId, Guid? customerId, bool? includeAll, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetReceivablesDueQuery(asOfUtc ?? DateTime.UtcNow, withinDays ?? 7, branchId, customerId, includeAll ?? false), ct))
            .WithName("GetReceivablesDue")
            .WithSummary("Open customer debts by due date — overdue or due within N days, with totals per customer")
            .RequirePermission(CustomersPermissions.Ledger.View);
    }
}
