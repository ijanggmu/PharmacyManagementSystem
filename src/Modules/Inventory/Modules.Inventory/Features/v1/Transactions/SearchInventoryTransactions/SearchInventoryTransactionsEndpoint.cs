using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Transactions;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Transactions.SearchInventoryTransactions;

public static class SearchInventoryTransactionsEndpoint
{
    internal static RouteHandlerBuilder MapSearchInventoryTransactionsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/transactions",
                async ([AsParameters] SearchInventoryTransactionsQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("SearchInventoryTransactions")
            .WithSummary("Inventory movement history (audit trail) — read-only list over InventoryTransactions")
            .RequirePermission(InventoryPermissions.Reports.View);
}
