using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Cheques.SearchCheques;

public static class SearchChequesEndpoint
{
    internal static RouteHandlerBuilder MapSearchChequesEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/banking/cheques",
                async ([AsParameters] SearchChequesQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("SearchCheques")
            .WithSummary("Search the cheque register (received and issued cheques, post-dated cheques due)")
            .RequirePermission(AccountingPermissions.Banking.View);

    internal static RouteHandlerBuilder MapGetChequeByIdEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/banking/cheques/{id:guid}",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetChequeByIdQuery(id), ct)))
            .WithName("GetChequeById")
            .WithSummary("Get a cheque with its status history")
            .RequirePermission(AccountingPermissions.Banking.View);
}
