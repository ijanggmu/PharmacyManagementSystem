using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.CashShifts.GetCashShiftSummary;

/// <summary>
/// Reconciles a shift's cash drawer: <c>ExpectedCash = OpeningFloat + cash sales + cash customers paid on
/// account - cash paid out for returns/refunds</c> in the shift window (see <see cref="CashDrawerCalculator"/>). An open shift is
/// computed live to "now"; a closed shift returns the figures frozen when it was closed, so later
/// cancellations/returns of its sales don't rewrite a reconciled drawer. Shifts closed before the
/// figures were frozen are still computed live over their window.
/// </summary>
public sealed class GetCashShiftSummaryQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch, IMediator mediator)
    : IQueryHandler<GetCashShiftSummaryQuery, CashShiftSummaryDto>
{
    public async ValueTask<CashShiftSummaryDto> Handle(GetCashShiftSummaryQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var shift = await dbContext.CashShifts
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == query.CashShiftId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Cash shift {query.CashShiftId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(shift.BranchId, $"Cash shift {query.CashShiftId} not found.", cancellationToken).ConfigureAwait(false);

        CashDrawerTotals totals;
        decimal expectedCash;
        if (shift.ClosingExpectedCash is { } frozenExpected)
        {
            totals = new CashDrawerTotals(
                shift.ClosingCashSalesTotal ?? 0m,
                shift.ClosingNonCashSalesTotal ?? 0m,
                shift.ClosingCashRefundsTotal ?? 0m,
                shift.ClosingSalesCount ?? 0,
                shift.ClosingCashReceiptsTotal ?? 0m);
            expectedCash = frozenExpected;
        }
        else
        {
            var windowEndUtc = shift.ClosedAtUtc ?? DateTime.UtcNow;
            totals = await CashDrawerCalculator
                .ComputeAsync(dbContext, mediator, shift.BranchId, shift.OpenedAtUtc, windowEndUtc, cancellationToken)
                .ConfigureAwait(false);
            expectedCash = totals.ExpectedCash(shift.OpeningFloat);
        }

        decimal? variance = shift.ClosingCashCounted is { } counted ? counted - expectedCash : null;

        return new CashShiftSummaryDto(
            shift.Id, shift.OpenedAtUtc, shift.ClosedAtUtc, shift.Status.ToString(),
            shift.OpeningFloat, totals.CashSales, totals.NonCashSales, totals.SalesCount,
            expectedCash, shift.ClosingCashCounted, variance, totals.CashRefunds, totals.CashReceipts);
    }
}
