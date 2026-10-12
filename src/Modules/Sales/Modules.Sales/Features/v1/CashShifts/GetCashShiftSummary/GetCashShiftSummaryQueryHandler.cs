using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.CashShifts.GetCashShiftSummary;

/// <summary>
/// Reconciles a shift's cash drawer: <c>ExpectedCash = OpeningFloat + cash sales + cash customers paid on
/// account − cash refunds paid out</c>, all during the shift window at the shift's branch (the window runs to
/// <c>ClosedAtUtc</c> once closed, or "now" while still open). A sale cancelled during the window is excluded
/// (its cash went back); one cancelled after the window still counts, so a closed shift's figure never moves.
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

        var windowEndUtc = shift.ClosedAtUtc ?? DateTime.UtcNow;

        var salesInWindowQuery = dbContext.Sales
            .AsNoTracking()
            // Only this branch's drawer: sales rung up at other branches in the same window are theirs.
            .Where(s => (s.Status == SaleStatus.Completed || (s.Status == SaleStatus.Cancelled && s.CancelledAtUtc > windowEndUtc))
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

        // Cash handed back for refunds completed in the window (a refund completes when its money is paid out).
        decimal cashRefunds = await dbContext.SaleRefunds.AsNoTracking()
            .Where(r => r.BranchId == shift.BranchId && r.Status == RefundStatus.Completed
                && r.AccountingPostedAtUtc >= shift.OpenedAtUtc && r.AccountingPostedAtUtc <= windowEndUtc)
            .SumAsync(r => r.CashPaidOut, cancellationToken)
            .ConfigureAwait(false);

        decimal cashReceipts = await mediator.Send(
            new GetCashCustomerReceiptsQuery(shift.BranchId, shift.OpenedAtUtc, windowEndUtc), cancellationToken)
            .ConfigureAwait(false);

        decimal expectedCash = shift.OpeningFloat + cashTotal + cashReceipts - cashRefunds;
        decimal? variance = shift.ClosingCashCounted is { } counted ? counted - expectedCash : null;

        return new CashShiftSummaryDto(
            shift.Id, shift.OpenedAtUtc, shift.ClosedAtUtc, shift.Status.ToString(),
            shift.OpeningFloat, cashTotal, nonCashTotal, saleCount,
            expectedCash, shift.ClosingCashCounted, variance, cashRefunds, cashReceipts);
    }
}
