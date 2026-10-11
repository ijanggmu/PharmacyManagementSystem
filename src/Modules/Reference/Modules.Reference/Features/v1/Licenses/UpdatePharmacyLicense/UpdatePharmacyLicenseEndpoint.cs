using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Modules.Reference.Contracts.v1.Licenses;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Licenses.UpdatePharmacyLicense;

public static class UpdatePharmacyLicenseEndpoint
{
    internal static RouteHandlerBuilder MapUpdatePharmacyLicenseEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/licenses/{id:guid}",
                async (Guid id, UpdatePharmacyLicenseCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command with { Id = id }, ct)))
            .WithName("UpdatePharmacyLicense")
            .WithSummary("Update or renew a license (a new expiry restarts its reminders)")
            .RequirePermission(ReferencePermissions.Settings.Update);
    }
}
