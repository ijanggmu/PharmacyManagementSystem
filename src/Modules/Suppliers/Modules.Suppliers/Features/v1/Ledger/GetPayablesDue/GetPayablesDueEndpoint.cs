using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetPayablesDue;

public static class GetPayablesDueEndpoint
{
    internal static RouteHandlerBuilder MapGetPayablesDueEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/payables-due",
                (DateTime? asOfUtc, int? withinDays, Guid? branchId, bool? includeAll, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetPayablesDueQuery(asOfUtc ?? DateTime.UtcNow, withinDays ?? 7, branchId, includeAll ?? false), ct))
            .WithName("GetPayablesDue")
            .WithSummary("Payment scheduling — open supplier bills overdue or due within N days, with totals per supplier")
            .RequirePermission(SuppliersPermissions.Ledger.View);
    }
}
