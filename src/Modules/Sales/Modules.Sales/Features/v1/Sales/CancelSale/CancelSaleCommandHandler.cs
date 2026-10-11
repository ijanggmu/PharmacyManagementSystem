using System.Diagnostics;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Sales.CancelSale;

/// <summary>
/// Marks the sale cancelled and commits that alone — voiding the GL voucher (Accounting) and
/// restocking (Inventory) are driven asynchronously by <see cref="SaleCancelledIntegrationEvent"/>
/// via the Outbox, same reasoning as CreateSaleCommandHandler (pharmacy-modules-plan.md §2).
/// </summary>
public sealed class CancelSaleCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser) : ICommandHandler<CancelSaleCommand, Guid>
{
    public async ValueTask<Guid> Handle(CancelSaleCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var sale = await dbContext.Sales
            .Include(s => s.Items)
            .FirstOrDefaultAsync(s => s.Id == command.SaleId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.SaleId} not found.");

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
            Lines: lines),
            cancellationToken).ConfigureAwait(false);

        return sale.Id;
    }
}
