using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierOpenBills;

public static class GetSupplierOpenBillsEndpoint
{
    internal static RouteHandlerBuilder MapGetSupplierOpenBillsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/suppliers/{supplierId:guid}/open-bills",
                (Guid supplierId, bool? onlyOpen, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetSupplierOpenBillsQuery(supplierId, onlyOpen ?? true, branchId), ct))
            .WithName("GetSupplierOpenBills")
            .WithSummary("Get a supplier's bills with paid, credited and outstanding amounts (payments against a bill first, the rest oldest first)")
            .RequirePermission(SuppliersPermissions.Ledger.View);
    }
}
