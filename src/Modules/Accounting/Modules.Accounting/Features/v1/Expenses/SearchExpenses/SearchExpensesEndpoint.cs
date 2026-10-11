using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Expenses.SearchExpenses;

public static class SearchExpensesEndpoint
{
    internal static RouteHandlerBuilder MapSearchExpensesEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/expenses",
                async ([AsParameters] SearchExpensesQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("SearchExpenses")
            .WithSummary("Search expenses")
            .RequirePermission(AccountingPermissions.Expenses.View);
}
