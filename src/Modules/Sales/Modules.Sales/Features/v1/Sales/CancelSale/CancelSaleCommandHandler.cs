using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Sales.CancelSale;

/// <summary>
/// Marks the sale cancelled and commits that alone — voiding the GL voucher (Accounting) and
/// restocking (Inventory) are driven asynchronously by <see cref="SaleCancelledIntegrationEvent"/>
/// via the Outbox, same reasoning as CreateSaleCommandHandler (pharmacy-modules-plan.md §2).
///
/// A sale with a return or refund (not rejected) can't be cancelled: cancelling restocks and reverses the
/// whole sale, so the units and money already given back would be given back a second time. The sale row
/// is locked first, so a return or refund racing this cancel either commits before it (and blocks it) or
/// waits and then sees the sale cancelled.
/// </summary>
public sealed class CancelSaleCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser) : ICommandHandler<CancelSaleCommand, Guid>
{
    public async ValueTask<Guid> Handle(CancelSaleCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        return await SalesTransaction.ExecuteAsync(dbContext, ct => CancelAsync(command, ct), cancellationToken)
            .ConfigureAwait(false);
    }

    private async ValueTask<Guid> CancelAsync(CancelSaleCommand command, CancellationToken cancellationToken)
    {
        await SalesTransaction.LockSaleRowAsync(dbContext, command.SaleId, cancellationToken).ConfigureAwait(false);

        var sale = await dbContext.Sales
            .Include(s => s.Items)
            .FirstOrDefaultAsync(s => s.Id == command.SaleId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.SaleId} not found.");

        bool givenBack =
            await dbContext.SaleReturns.AnyAsync(r => r.SaleId == sale.Id && r.Status != ReturnStatus.Rejected, cancellationToken).ConfigureAwait(false)
            || await dbContext.SaleRefunds.AnyAsync(r => r.OriginalSaleId == sale.Id && r.Status != RefundStatus.Rejected, cancellationToken).ConfigureAwait(false);
        if (givenBack)
        {
            throw new CustomException(
                "This sale has a return or refund, so it can't be cancelled — that would give the same units and money back twice. Return or refund the rest instead.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        sale.Cancel(command.Reason);

        // One line per sale item, carrying the batch it was sold from so Inventory restocks into that lot.
        var lines = sale.Items
            .Select(i => new SaleCancelledLine(i.MedicineId, i.Quantity, i.UnitCostPrice, i.BatchId))
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
            BranchId: sale.BranchId),
            cancellationToken).ConfigureAwait(false);

        return sale.Id;
    }
}
