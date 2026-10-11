using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Modules.Reference.Contracts.v1.Licenses;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Licenses.CreatePharmacyLicense;

public static class CreatePharmacyLicenseEndpoint
{
    internal static RouteHandlerBuilder MapCreatePharmacyLicenseEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/licenses",
                async (CreatePharmacyLicenseCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreatePharmacyLicense")
            .WithSummary("Record a license or registration and its expiry")
            .RequirePermission(ReferencePermissions.Settings.Update);
    }
}
