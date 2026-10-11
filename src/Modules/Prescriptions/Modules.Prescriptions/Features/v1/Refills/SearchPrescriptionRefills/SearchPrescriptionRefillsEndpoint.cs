using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.v1.Refills;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Prescriptions.Features.v1.Refills.SearchPrescriptionRefills;

public static class SearchPrescriptionRefillsEndpoint
{
    internal static RouteHandlerBuilder MapSearchPrescriptionRefillsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/refills",
                (Guid? prescriptionId, Guid? customerId, Guid? medicineId, DateTime? dateFrom, DateTime? dateTo,
                 int? pageNumber, int? pageSize, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new SearchPrescriptionRefillsQuery(
                            prescriptionId, customerId, medicineId, dateFrom, dateTo,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value),
                        ct))
            .WithName("SearchPrescriptionRefills")
            .WithSummary("Search recorded prescription refills (paged; filter by prescription, customer, medicine and date range)")
            .RequirePermission(PrescriptionsPermissions.Prescriptions.View);
    }
}
