using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Tds;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Tds.UpdateTdsCategories;

public static class UpdateTdsCategoriesEndpoint
{
    internal static RouteHandlerBuilder MapUpdateTdsCategoriesEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPut("/tds/categories",
                async (UpdateTdsCategoriesCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("UpdateTdsCategories")
            .WithSummary("Save the TDS (withholding tax) categories and rates (Finance setup)")
            .RequirePermission(AccountingPermissions.Accounts.Update);
}
