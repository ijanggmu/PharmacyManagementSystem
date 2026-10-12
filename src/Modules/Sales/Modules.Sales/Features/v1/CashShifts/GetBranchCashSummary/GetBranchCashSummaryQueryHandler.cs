using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.CashShifts.GetBranchCashSummary;

/// <summary>
/// Per-branch drawer expectation for every open shift: opening float + cash sales + cash customers paid on
/// account - cash paid out for returns/refunds, over the shift's own branch and window (opened-at to now) — the same computation as
/// <c>GetCashShiftSummaryQueryHandler</c> (<see cref="CashDrawerCalculator"/>).
/// </summary>
public sealed class GetBranchCashSummaryQueryHandler(SalesDbContext dbContext, IBranchService branchService, IMediator mediator)
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
            var totals = await CashDrawerCalculator
                .ComputeAsync(dbContext, mediator, shift.BranchId, shift.OpenedAtUtc, nowUtc, cancellationToken)
                .ConfigureAwait(false);

            string branchName = names.TryGetValue(shift.BranchId, out var name) ? name : string.Empty;
            rows.Add(new BranchCashSummaryDto(
                shift.BranchId,
                branchName,
                shift.Id,
                shift.OpeningFloat,
                totals.CashSales,
                totals.ExpectedCash(shift.OpeningFloat),
                totals.CashRefunds,
                totals.CashReceipts));
        }

        return rows;
    }
}
