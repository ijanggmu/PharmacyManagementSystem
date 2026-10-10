using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Ird;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Ird.GetIrdSalesRegister;

public static class GetIrdSalesRegisterEndpoint
{
    internal static RouteHandlerBuilder MapGetIrdSalesRegisterEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/ird-sales-register",
                (DateTime periodStartUtc, DateTime periodEndUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetIrdSalesRegisterQuery(periodStartUtc, periodEndUtc, branchId), ct))
            .WithName("GetIrdSalesRegister")
            .WithSummary("IRD sales-register report rows for a period (Nepal e-invoice compliance)")
            .RequirePermission(SalesPermissions.Ird.View);
    }
}
