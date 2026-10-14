using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Context;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Authorization;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Multitenancy.Features.v1.GetMyTenantStatus;

public static class GetMyTenantStatusEndpoint
{
    public static RouteHandlerBuilder Map(IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/me/status", async (
                IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor,
                ITenantService tenantService,
                ICurrentUser currentUser,
                IUserPermissionService permissions,
                CancellationToken cancellationToken) =>
            {
                var tenantId = tenantAccessor.MultiTenantContext?.TenantInfo?.Id;
                if (string.IsNullOrEmpty(tenantId))
                {
                    return Results.Unauthorized();
                }

                var status = await tenantService.GetStatusAsync(tenantId, cancellationToken).ConfigureAwait(false);
                return Results.Ok(await ForCallerAsync(status, currentUser, permissions, cancellationToken).ConfigureAwait(false));
            })
            .WithName("GetMyTenantStatus")
            .WithSummary("Get the calling tenant's status")
            .WithDescription("Returns plan, validity, and expiry/grace state for the authenticated tenant — used by the tenant dashboard to show plan info and expiry warnings. The owner's email is only included for callers who manage users or tenants.")
            .RequireAuthorization()
            .Produces<TenantStatusDto>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized);
    }

    /// <summary>
    /// Every signed-in user reads the plan and expiry state, but the owner's email is contact data for whoever
    /// administers the pharmacy: kept only for callers holding Users.Create (tenant admin) or Tenants.View (operator).
    /// </summary>
    public static async Task<TenantStatusDto> ForCallerAsync(
        TenantStatusDto status,
        ICurrentUser currentUser,
        IUserPermissionService permissions,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(status);
        ArgumentNullException.ThrowIfNull(currentUser);
        ArgumentNullException.ThrowIfNull(permissions);

        var userId = currentUser.GetUserId();
        if (userId != Guid.Empty)
        {
            string id = userId.ToString();
            if (await permissions.HasPermissionAsync(id, IdentityPermissions.Users.Create, cancellationToken).ConfigureAwait(false)
                || await permissions.HasPermissionAsync(id, MultitenancyPermissions.Tenants.View, cancellationToken).ConfigureAwait(false))
            {
                return status;
            }
        }

        return status.WithoutAdminEmail();
    }
}
