using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.SearchVouchers;

public static class SearchVouchersEndpoint
{
    internal static RouteHandlerBuilder MapSearchVouchersEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/vouchers",
                (string? search, string? status, string? voucherType, string? source, DateTime? dateFromUtc, DateTime? dateToUtc,
                 Guid? branchId, int? pageNumber, int? pageSize, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new SearchVouchersQuery(
                            search, status, voucherType, dateFromUtc, dateToUtc, branchId,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            source),
                        ct))
            .WithName("SearchVouchers")
            .WithSummary("Search vouchers (paged; search text, status incl. reversed/voided/reversal, type, source, date range)")
            .RequirePermission(AccountingPermissions.Vouchers.View);
    }
}
