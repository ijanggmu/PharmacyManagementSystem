using FSH.Modules.Appointments.Contracts.v1.Appointments;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Services;

/// <summary>
/// The one place a branch drawer's movements in a window are summed — used by the shift summary, the
/// per-branch open-shift summary and the shift close (which freezes the result).
/// <list type="bullet">
/// <item>Cash in: cash legs of sales completed at the branch in the window (cancelled sales excluded —
/// the cash went back to the customer).</item>
/// <item>Cash out: the cash legs of sales rung up before the window but cancelled within it, and the cash
/// part of returns/refunds completed at the branch in the window
/// (<see cref="SaleReturn.SettlementCashAmount"/>/<see cref="SaleRefund.SettlementCashAmount"/>,
/// stamped when they complete; returns/refunds on account or to a bank/card never touch the drawer).</item>
/// <item>Cash in, besides sales: cash customers paid against their account at the branch in the window
/// (asked of Customers, <see cref="GetCashCustomerReceiptsQuery"/>; payments recorded before the method was
/// stored are not counted).</item>
/// <item>The doctors' desk: consultation fees taken in cash at the branch in the window, less cash fees given back
/// and doctors paid in cash (asked of Appointments, <see cref="GetAppointmentDrawerCashQuery"/>).</item>
/// </list>
/// </summary>
internal static class CashDrawerCalculator
{
    public static async Task<CashDrawerTotals> ComputeAsync(
        SalesDbContext dbContext, IMediator mediator, Guid branchId, DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(mediator);

        var salesInWindow = dbContext.Sales
            .AsNoTracking()
            .Where(s => s.Status == SaleStatus.Completed
                && s.BranchId == branchId
                && s.SaleDateUtc >= fromUtc
                && s.SaleDateUtc <= toUtc);

        int saleCount = await salesInWindow.CountAsync(cancellationToken).ConfigureAwait(false);

        // Per-tender amounts: a split-tender sale contributes each leg to its own method. Credit legs are on
        // account, not received, and are excluded from both totals.
        var legs = await salesInWindow
            .SelectMany(s => s.Payments)
            .Select(p => new { p.Method, p.Amount })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal cashSales = legs
            .Where(p => string.Equals(p.Method, SalePaymentMethods.Cash, StringComparison.OrdinalIgnoreCase))
            .Sum(p => p.Amount);
        decimal nonCashSales = legs
            .Where(p => !string.Equals(p.Method, SalePaymentMethods.Cash, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(p.Method, SalePaymentMethods.Credit, StringComparison.OrdinalIgnoreCase))
            .Sum(p => p.Amount);

        decimal returnCash = await dbContext.SaleReturns
            .AsNoTracking()
            .Where(r => r.BranchId == branchId
                && r.StockRestoredAtUtc != null
                && r.StockRestoredAtUtc >= fromUtc
                && r.StockRestoredAtUtc <= toUtc)
            .SumAsync(r => r.SettlementCashAmount ?? 0m, cancellationToken)
            .ConfigureAwait(false);

        decimal refundCash = await dbContext.SaleRefunds
            .AsNoTracking()
            .Where(r => r.BranchId == branchId
                && r.AccountingPostedAtUtc != null
                && r.AccountingPostedAtUtc >= fromUtc
                && r.AccountingPostedAtUtc <= toUtc)
            .SumAsync(r => r.SettlementCashAmount ?? 0m, cancellationToken)
            .ConfigureAwait(false);

        // A sale rung up BEFORE the window and cancelled within it: its cash went back out of the drawer in this
        // window. (A sale both rung up and cancelled within the window is already left out of cash in above.)
        var cancelledLegs = await dbContext.Sales
            .AsNoTracking()
            .Where(s => s.Status == SaleStatus.Cancelled
                && s.BranchId == branchId
                && s.SaleDateUtc < fromUtc
                && s.CancelledAtUtc != null
                && s.CancelledAtUtc >= fromUtc
                && s.CancelledAtUtc <= toUtc)
            .SelectMany(s => s.Payments)
            .Select(p => new { p.Method, p.Amount })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        decimal cancelledCash = cancelledLegs
            .Where(p => string.Equals(p.Method, SalePaymentMethods.Cash, StringComparison.OrdinalIgnoreCase))
            .Sum(p => p.Amount);

        decimal cashReceipts = await mediator.Send(new GetCashCustomerReceiptsQuery(branchId, fromUtc, toUtc), cancellationToken)
            .ConfigureAwait(false);

        decimal creditSales = legs
            .Where(p => string.Equals(p.Method, SalePaymentMethods.Credit, StringComparison.OrdinalIgnoreCase))
            .Sum(p => p.Amount);

        decimal consultationCash = await mediator.Send(new GetAppointmentDrawerCashQuery(branchId, fromUtc, toUtc), cancellationToken)
            .ConfigureAwait(false);

        return new CashDrawerTotals(
            cashSales, nonCashSales, returnCash + refundCash + cancelledCash, saleCount, cashReceipts, creditSales, consultationCash);
    }
}
