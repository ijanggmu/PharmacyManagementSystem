using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Reports.GetNarcoticRegister;

public static class GetNarcoticRegisterEndpoint
{
    internal static RouteHandlerBuilder MapGetNarcoticRegisterEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/narcotic-register",
                (DateTime periodStartUtc, DateTime periodEndUtc, string? medicineName, string? doctorName, string? schedule,
                        int? pageNumber, int? pageSize, Guid? branchId,
                        IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new GetNarcoticRegisterQuery(
                            periodStartUtc, periodEndUtc, medicineName, doctorName, schedule,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            branchId),
                        ct))
            .WithName("GetNarcoticRegister")
            .WithSummary("Controlled-substance (DDA/narcotic) dispensing register for a period, paged")
            // A clinical register the pharmacist keeps for the DDA, not a sales figure: gated like the other
            // prescription reports, so a pharmacist can keep it without seeing revenue.
            .RequirePermission(PrescriptionsPermissions.Reports.View);
    }
}
