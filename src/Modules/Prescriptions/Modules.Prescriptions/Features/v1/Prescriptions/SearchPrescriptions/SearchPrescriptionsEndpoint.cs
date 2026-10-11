using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.SearchPrescriptions;

public static class SearchPrescriptionsEndpoint
{
    internal static RouteHandlerBuilder MapSearchPrescriptionsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("",
                (Guid? customerId, string[]? status, int? pageNumber, int? pageSize, Guid? createdByUserId,
                 string? search, DateOnly? dateFrom, DateOnly? dateTo,
                 IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new SearchPrescriptionsQuery(
                            customerId, status,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            createdByUserId,
                            search, dateFrom, dateTo),
                        ct))
            .WithName("SearchPrescriptions")
            .WithSummary("Search prescriptions (paged; filter by customer, status, prescription date range and a search over prescription number, prescriber and patient)")
            .RequirePermission(PrescriptionsPermissions.Prescriptions.View);
    }
}
