using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Accounts.SearchAccounts;

public static class SearchAccountsEndpoint
{
    internal static RouteHandlerBuilder MapSearchAccountsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/accounts",
                (string? search, string? accountType, bool? isActive, int? pageNumber, int? pageSize, bool? postableOnly,
                 IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new SearchAccountsQuery(
                            search, accountType, isActive,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            postableOnly ?? false),
                        ct))
            .WithName("SearchAccounts")
            .WithSummary("Search the chart of accounts (paged, filter by type/active/postable leaves)")
            .RequirePermission(AccountingPermissions.Accounts.View);
    }
}
