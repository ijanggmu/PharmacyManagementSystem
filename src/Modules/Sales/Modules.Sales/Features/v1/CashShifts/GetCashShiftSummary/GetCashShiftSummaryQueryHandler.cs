using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.CashShifts.GetCashShiftSummary;

/// <summary>
/// Reconciles a shift's cash drawer: <c>ExpectedCash = OpeningFloat + cash sales completed during the
/// shift window</c> (the window runs to <c>ClosedAtUtc</c> once closed, or "now" while still open).
/// Cancelled sales are excluded — a cancellation restocks/voids the voucher but the cash was never
/// actually taken out of the drawer for a sale that no longer counts.
/// </summary>
public sealed class GetCashShiftSummaryQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
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

        var windowEndUtc = shift.ClosedAtUtc ?? DateTime.UtcNow;

        var salesInWindowQuery = dbContext.Sales
            .AsNoTracking()
            // Only this branch's drawer: sales rung up at other branches in the same window are theirs.
            .Where(s => s.Status == SaleStatus.Completed
                && s.BranchId == shift.BranchId
                && s.SaleDateUtc >= shift.OpenedAtUtc
                && s.SaleDateUtc <= windowEndUtc);

        int saleCount = await salesInWindowQuery
            .CountAsync(cancellationToken)
            .ConfigureAwait(false);

        // Per-tender amounts: a split-tender sale contributes each leg to its own method, so cash paid
        // alongside a card is attributed to cash. Credit legs are on account, not received, and are
        // excluded from both totals (as PaymentAmount always excluded them).
        var legs = await salesInWindowQuery
            .SelectMany(s => s.Payments)
            .Select(p => new { p.Method, p.Amount })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        legs = legs.Where(p => !string.Equals(p.Method, SalePaymentMethods.Credit, StringComparison.OrdinalIgnoreCase)).ToList();

        decimal cashTotal = legs
            .Where(p => string.Equals(p.Method, SalePaymentMethods.Cash, StringComparison.OrdinalIgnoreCase))
            .Sum(p => p.Amount);
        decimal nonCashTotal = legs
            .Where(p => !string.Equals(p.Method, SalePaymentMethods.Cash, StringComparison.OrdinalIgnoreCase))
            .Sum(p => p.Amount);

        decimal expectedCash = shift.OpeningFloat + cashTotal;
        decimal? variance = shift.ClosingCashCounted is { } counted ? counted - expectedCash : null;

        return new CashShiftSummaryDto(
            shift.Id, shift.OpenedAtUtc, shift.ClosedAtUtc, shift.Status.ToString(),
            shift.OpeningFloat, cashTotal, nonCashTotal, saleCount,
            expectedCash, shift.ClosingCashCounted, variance);
    }
}
