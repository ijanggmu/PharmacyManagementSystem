using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.Reports.GetIrdPurchaseRegister;

public static class GetIrdPurchaseRegisterEndpoint
{
    internal static RouteHandlerBuilder MapGetIrdPurchaseRegisterEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/ird-purchase-register",
                (DateTime periodStartUtc, DateTime periodEndUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetIrdPurchaseRegisterQuery(periodStartUtc, periodEndUtc, branchId), ct))
            .WithName("GetIrdPurchaseRegister")
            .WithSummary("IRD purchase-register report rows for a period (Nepal e-invoice compliance)")
            .RequirePermission(PurchasingPermissions.PurchaseOrders.View);
    }
}
