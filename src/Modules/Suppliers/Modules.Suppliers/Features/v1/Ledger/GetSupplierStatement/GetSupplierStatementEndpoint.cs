using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierStatement;

public static class GetSupplierStatementEndpoint
{
    internal static RouteHandlerBuilder MapGetSupplierStatementEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/suppliers/{supplierId:guid}/statement",
                (Guid supplierId, DateTime fromUtc, DateTime toUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetSupplierStatementQuery(supplierId, fromUtc, toUtc, branchId), ct))
            .WithName("GetSupplierStatement")
            .WithSummary("Get a supplier's AP statement (opening/closing balance and lines) over a date range")
            .RequirePermission(SuppliersPermissions.Ledger.View);
    }
}
