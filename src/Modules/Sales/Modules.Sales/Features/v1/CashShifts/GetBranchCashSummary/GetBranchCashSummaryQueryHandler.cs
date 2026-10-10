using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.CashShifts.GetBranchCashSummary;

/// <summary>
/// Per-branch drawer expectation for every open shift. Sales are scoped to the shift's own branch and
/// window (opened-at to now), and cancelled sales are excluded, matching <c>GetCashShiftSummaryQueryHandler</c>.
/// </summary>
public sealed class GetBranchCashSummaryQueryHandler(SalesDbContext dbContext, IBranchService branchService)
    : IQueryHandler<GetBranchCashSummaryQuery, IReadOnlyList<BranchCashSummaryDto>>
{
    public async ValueTask<IReadOnlyList<BranchCashSummaryDto>> Handle(
        GetBranchCashSummaryQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var openShifts = await dbContext.CashShifts
            .AsNoTracking()
            .Where(s => s.Status == CashShiftStatus.Open)
            .OrderBy(s => s.OpenedAtUtc)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (openShifts.Count == 0)
        {
            return [];
        }

        var branches = await branchService.GetAllForCurrentTenantAsync(cancellationToken).ConfigureAwait(false);
        var names = branches.ToDictionary(b => b.Id, b => b.Name);
        var nowUtc = DateTime.UtcNow;

        var rows = new List<BranchCashSummaryDto>(openShifts.Count);
        foreach (var shift in openShifts)
        {
            var legs = await dbContext.Sales
                .AsNoTracking()
                .Where(s => s.BranchId == shift.BranchId
                    && s.Status == SaleStatus.Completed
                    && s.SaleDateUtc >= shift.OpenedAtUtc
                    && s.SaleDateUtc <= nowUtc)
                .SelectMany(s => s.Payments)
                .Select(p => new { p.Method, p.Amount })
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            decimal cashSales = legs
                .Where(p => string.Equals(p.Method, SalePaymentMethods.Cash, StringComparison.OrdinalIgnoreCase))
                .Sum(p => p.Amount);

            string branchName = names.TryGetValue(shift.BranchId, out var name) ? name : string.Empty;
            rows.Add(new BranchCashSummaryDto(
                shift.BranchId,
                branchName,
                shift.Id,
                shift.OpeningFloat,
                cashSales,
                shift.OpeningFloat + cashSales));
        }

        return rows;
    }
}
