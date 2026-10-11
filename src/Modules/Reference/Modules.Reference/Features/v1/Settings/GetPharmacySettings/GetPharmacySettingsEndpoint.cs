using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Modules.Reference.Contracts.v1.Settings;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Settings.GetPharmacySettings;

public static class GetPharmacySettingsEndpoint
{
    internal static RouteHandlerBuilder MapGetPharmacySettingsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/settings",
                (IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetPharmacySettingsQuery(), ct))
            .WithName("GetPharmacySettings")
            .WithSummary("Get the tenant's pharmacy settings")
            .RequirePermission(ReferencePermissions.Settings.View);
    }
}
