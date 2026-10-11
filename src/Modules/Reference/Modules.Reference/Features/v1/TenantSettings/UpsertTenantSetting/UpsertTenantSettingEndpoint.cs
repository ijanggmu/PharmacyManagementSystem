using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.TenantSettings.UpsertTenantSetting;

public static class UpsertTenantSettingEndpoint
{
    internal static RouteHandlerBuilder MapUpsertTenantSettingEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/settings/{key}",
                async (string key, UpsertTenantSettingRequest request, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new UpsertTenantSettingCommand(key, request.Value), ct).ConfigureAwait(false)))
            .WithName("UpsertTenantSetting")
            .WithSummary("Create or update a tenant setting by key")
            .RequirePermission(ReferencePermissions.Settings.Update);
    }
}
