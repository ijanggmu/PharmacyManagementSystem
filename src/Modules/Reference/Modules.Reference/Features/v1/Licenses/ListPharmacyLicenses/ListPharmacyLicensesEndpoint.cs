using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Modules.Reference.Contracts.v1.Licenses;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Licenses.ListPharmacyLicenses;

public static class ListPharmacyLicensesEndpoint
{
    internal static RouteHandlerBuilder MapListPharmacyLicensesEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/licenses",
                (IMediator mediator, CancellationToken ct) => mediator.Send(new ListPharmacyLicensesQuery(), ct))
            .WithName("ListPharmacyLicenses")
            .WithSummary("The pharmacy's licenses and registrations with days left until expiry")
            .RequirePermission(ReferencePermissions.Settings.View);
    }
}
