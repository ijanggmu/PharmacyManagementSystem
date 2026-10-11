using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances.EditOpeningBalances;

public static class EditOpeningBalancesEndpoint
{
    internal static RouteHandlerBuilder MapEditOpeningBalancesEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/opening-balances/edit",
                async (EditOpeningBalancesCommand command, IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(command, ct)))
            .WithName("EditOpeningBalances")
            .WithSummary("Reverse the active opening voucher and post a replacement (reason required)")
            .Produces<OpeningBalanceMutationResultDto>()
            .RequirePermission(AccountingPermissions.OpeningBalances.Manage)
            .WithIdempotency();
}
