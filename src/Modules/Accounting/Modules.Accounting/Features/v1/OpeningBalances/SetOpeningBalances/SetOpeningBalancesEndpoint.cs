using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances.SetOpeningBalances;

public static class SetOpeningBalancesEndpoint
{
    internal static RouteHandlerBuilder MapSetOpeningBalancesEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/opening-balances",
                async (SetOpeningBalancesCommand command, IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(command, ct)))
            .WithName("SetOpeningBalances")
            .WithSummary("Post a branch's opening balances (first time, or after a reset)")
            .Produces<OpeningBalanceMutationResultDto>()
            .RequirePermission(AccountingPermissions.OpeningBalances.Manage)
            .WithIdempotency();
}
