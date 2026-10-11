using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.TenantSettings.GetTenantSettings;

public static class GetTenantSettingsEndpoint
{
    // Path is /settings/all because GET /settings is already mapped by the PharmacySettings endpoint.
    internal static RouteHandlerBuilder MapGetTenantSettingsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/settings/all",
                (string? category, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetTenantSettingsQuery(category), ct))
            .WithName("GetTenantSettings")
            .WithSummary("Get tenant setting key/value pairs, optionally one category (key prefix before the first '.')")
            .RequirePermission(ReferencePermissions.Settings.View);
    }
}
