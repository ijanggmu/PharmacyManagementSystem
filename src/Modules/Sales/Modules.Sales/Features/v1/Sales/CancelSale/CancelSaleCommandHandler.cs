using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Sales.CancelSale;

/// <summary>
/// Marks the sale cancelled and commits that alone — voiding the GL voucher (Accounting), restocking
/// (Inventory) and reversing the customer's AR balance and loyalty points (Customers) are driven
/// asynchronously by <see cref="SaleCancelledIntegrationEvent"/> via the Outbox, same reasoning as
/// CreateSaleCommandHandler (pharmacy-modules-plan.md §2).
///
/// A cancellation reverses the WHOLE sale, so it is refused while any return or refund of it is pending,
/// approved or completed (only rejected ones don't count) — otherwise the goods/money given back by those
/// would be reversed twice. Runs under the sale row lock, the same lock returns/refunds take, so a
/// cancellation and a return of the same sale can't both slip through.
/// </summary>
public sealed class CancelSaleCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<CancelSaleCommand, Guid>
{
    public async ValueTask<Guid> Handle(CancelSaleCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        Guid branchId = await dbContext.Sales.AsNoTracking()
            .Where(s => s.Id == command.SaleId)
            .Select(s => s.BranchId)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (branchId == Guid.Empty)
        {
            throw new NotFoundException($"Sale {command.SaleId} not found.");
        }

        await currentBranch.EnsureCanSeeBranchAsync(branchId, $"Sale {command.SaleId} not found.", cancellationToken)
            .ConfigureAwait(false);

        return await SalesTransaction.ExecuteAsync(
            dbContext,
            ct => CancelAsync(command, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<Guid> CancelAsync(CancelSaleCommand command, CancellationToken cancellationToken)
    {
        await SalesTransaction.LockSaleRowAsync(dbContext, command.SaleId, cancellationToken).ConfigureAwait(false);

        var sale = await dbContext.Sales
            .Include(s => s.Items)
            .FirstOrDefaultAsync(s => s.Id == command.SaleId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.SaleId} not found.");

        int openReturns = await dbContext.SaleReturns
            .CountAsync(r => r.SaleId == sale.Id && r.Status != ReturnStatus.Rejected, cancellationToken)
            .ConfigureAwait(false);
        int openRefunds = await dbContext.SaleRefunds
            .CountAsync(r => r.OriginalSaleId == sale.Id && r.Status != RefundStatus.Rejected, cancellationToken)
            .ConfigureAwait(false);
        if (openReturns + openRefunds > 0)
        {
            throw new CustomException(
                $"This sale has {openReturns} return(s) and {openRefunds} refund(s) recorded against it, so it can't be " +
                "cancelled as a whole. Reject or finish those, then return/refund the rest of the sale instead.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        sale.Cancel(command.Reason);

        // Reconstruct one synthetic per-item cost line from the sale's own recorded
        // quantity/cost — the consumers only ever need QuantityDeducted/UnitCostPrice, never the
        // original batch id/no, since Sales never persisted per-batch FEFO allocation.
        var lines = sale.Items
            .Select(i => new SaleCancelledLine(i.MedicineId, i.Quantity, i.UnitCostPrice))
            .ToList();

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        var correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
        await outbox.AddAsync(new SaleCancelledIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: correlationId,
            Source: "Sales",
            SaleId: sale.Id,
            Reason: command.Reason,
            Lines: lines,
            BranchId: sale.BranchId,
            CustomerId: sale.CustomerId,
            OnAccountAmount: sale.BalanceDue,
            InvoiceNumber: sale.InvoiceNumber),
            cancellationToken).ConfigureAwait(false);

        return sale.Id;
    }
}
