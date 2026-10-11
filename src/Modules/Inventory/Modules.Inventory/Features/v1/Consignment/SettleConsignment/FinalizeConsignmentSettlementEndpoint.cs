using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Consignment.SettleConsignment;

public static class FinalizeConsignmentSettlementEndpoint
{
    /// <summary>Settles the supplier's open positions and returns the created settlement (id, total amount, positions).</summary>
    internal static RouteHandlerBuilder MapFinalizeConsignmentSettlementEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/consignment/settlements",
                async (SettleConsignmentCommand command, IMediator mediator, CancellationToken ct) =>
                {
                    var settlementId = await mediator.Send(command, ct).ConfigureAwait(false);
                    var settlement = await mediator.Send(new GetConsignmentSettlementByIdQuery(settlementId), ct).ConfigureAwait(false);
                    return Results.Ok(settlement);
                })
            .WithName("FinalizeConsignmentSettlement")
            .WithSummary("Settle everything owed to a supplier for consigned stock sold since the last settlement")
            .RequirePermission(InventoryPermissions.Consignment.Settle)
            .WithIdempotency();
}
