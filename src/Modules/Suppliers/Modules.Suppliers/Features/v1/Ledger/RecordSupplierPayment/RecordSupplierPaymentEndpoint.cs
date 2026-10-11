using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;

public static class CreateSupplierPaymentEndpoint
{
    internal static RouteHandlerBuilder MapCreateSupplierPaymentEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/suppliers/{supplierId:guid}/payments",
                async (Guid supplierId, RecordSupplierPaymentCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { SupplierId = supplierId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("CreateSupplierPayment")
            .WithSummary("Record a payment made to a supplier")
            .RequirePermission(SuppliersPermissions.Ledger.RecordPayment)
            .WithIdempotency();
    }
}
