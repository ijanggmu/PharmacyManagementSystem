using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.v1.Settings;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Settings.UpdatePharmacySettings;

public static class UpdatePharmacySettingsEndpoint
{
    internal static RouteHandlerBuilder MapUpdatePharmacySettingsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/settings",
                async (UpdatePharmacySettingsCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("UpdatePharmacySettings")
            .WithSummary("Update the tenant's pharmacy settings")
            .RequirePermission(ReferencePermissions.Settings.Update);
    }
}
