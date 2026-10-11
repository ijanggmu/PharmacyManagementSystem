using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Sales.DeleteSale;

/// <summary>
/// Sales are never deleted, matching the legacy <c>deleteSaleForTenant</c>, which always refused.
/// Every sale has stock movements, so this always answers 409; the caller should cancel the sale
/// (<c>POST /sales/{id}/cancel</c>, which restores stock) or record a return or refund instead.
/// </summary>
public static class DeleteSaleEndpoint
{
    internal static RouteHandlerBuilder MapDeleteSaleEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/{saleId:guid}", Refuse)
            .WithName("DeleteSale")
            .WithSummary("Not supported: sales are never deleted (409). Cancel the sale instead")
            .RequirePermission(SalesPermissions.Sales.Cancel);
    }

    private static IResult Refuse(Guid saleId) =>
        throw new CustomException(
            $"Sales cannot be deleted (sale {saleId}). Cancel the sale, record a return, or use Refunds to issue a credit.",
            (IEnumerable<string>?)null,
            HttpStatusCode.Conflict);
}
