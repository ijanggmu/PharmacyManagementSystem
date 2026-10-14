using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Tds;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Suppliers.Contracts.Authorization;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Tds.GetTdsCategories;

public static class GetTdsCategoriesEndpoint
{
    /// <summary>
    /// Any one of these opens a form that withholds TDS or manages it: the expense form (view/record expenses), the
    /// supplier payment dialog, Finance setup (where the rates are edited) and the TDS report. <c>RequirePermission</c>
    /// needs every permission it lists, so the any-of check is made here.
    /// </summary>
    internal static readonly string[] AllowedPermissions =
    [
        AccountingPermissions.Expenses.View,
        AccountingPermissions.Expenses.Record,
        SuppliersPermissions.Ledger.RecordPayment,
        AccountingPermissions.Accounts.Update,
        AccountingPermissions.Reports.View,
    ];

    internal static RouteHandlerBuilder MapGetTdsCategoriesEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/tds/categories", HandleAsync)
            .WithName("GetTdsCategories")
            .WithSummary("TDS (withholding tax) categories and their rates")
            .Produces<IReadOnlyList<FSH.Modules.Accounting.Contracts.Dtos.TdsCategoryDto>>()
            .Produces(StatusCodes.Status403Forbidden);

    public static async Task<IResult> HandleAsync(
        ICurrentUser currentUser, IUserPermissionService permissions, IMediator mediator, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(currentUser);
        ArgumentNullException.ThrowIfNull(permissions);
        ArgumentNullException.ThrowIfNull(mediator);

        string userId = currentUser.GetUserId().ToString();
        foreach (string permission in AllowedPermissions)
        {
            if (await permissions.HasPermissionAsync(userId, permission, ct).ConfigureAwait(false))
            {
                return TypedResults.Ok(await mediator.Send(new GetTdsCategoriesQuery(), ct).ConfigureAwait(false));
            }
        }

        throw new ForbiddenException("You need access to expenses, supplier payments or the TDS report to see the TDS categories.");
    }
}
