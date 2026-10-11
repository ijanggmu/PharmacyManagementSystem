using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierLedger;

public static class GetSupplierLedgerEndpoint
{
    internal static RouteHandlerBuilder MapGetSupplierLedgerEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/suppliers/{supplierId:guid}/ledger",
                (Guid supplierId, int? pageNumber, int? pageSize, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new GetSupplierLedgerQuery(
                            supplierId,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            branchId),
                        ct))
            .WithName("GetSupplierLedger")
            .WithSummary("Get a supplier's ledger entries (paged, newest first)")
            .RequirePermission(SuppliersPermissions.Ledger.View);
    }
}
