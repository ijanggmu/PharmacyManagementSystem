using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Appointments.Contracts.Authorization;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Appointments.Features.v1.Doctors.SearchDoctors;

public static class SearchDoctorsEndpoint
{
    internal static RouteHandlerBuilder MapSearchDoctorsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/doctors",
                (string? search, bool? includeInactive, int? pageNumber, int? pageSize,
                 IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new SearchDoctorsQuery(
                            search,
                            includeInactive ?? false,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value),
                        ct))
            .WithName("SearchDoctors")
            .WithSummary("Search doctors (paged; by name, NMC number or speciality)")
            .RequirePermission(AppointmentsPermissions.Doctors.View);
    }
}
