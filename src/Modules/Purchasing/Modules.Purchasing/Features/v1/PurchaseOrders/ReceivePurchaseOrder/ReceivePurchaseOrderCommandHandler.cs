using System.Data;
using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ReceivePurchaseOrder;

/// <summary>
/// Receives stock (Inventory, pre-commit, synchronous — a failed receipt must never mark the order
/// received) then commits the order locally. AP ledger posting (Suppliers) and GL voucher posting
/// (Accounting) are driven asynchronously by <see cref="PurchaseOrderReceivedIntegrationEvent"/> via
/// the Outbox, same reasoning as Sales — see docs/pharmacy-modules-plan.md §2. A short delivery cuts the
/// order down to what arrived before any of that happens, so stock, AP and GL all see the delivered
/// amounts; the undelivered balance optionally becomes a new draft backorder in the same save.
/// </summary>
public sealed class ReceivePurchaseOrderCommandHandler(
    PurchasingDbContext dbContext,
    IStockReceiptService stockReceiptService,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider) : ICommandHandler<ReceivePurchaseOrderCommand, ReceivePurchaseOrderResult>
{
    public async ValueTask<ReceivePurchaseOrderResult> Handle(ReceivePurchaseOrderCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (!dbContext.Database.IsRelational())
        {
            return await ReceiveAsync(command, cancellationToken).ConfigureAwait(false);
        }

        // One transaction for the stock (Inventory joins it on the shared connection), the order, the backorder
        // and the outbox event: they commit together or not at all.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        // Lock the order before reading it, so a double-clicked or concurrent receive waits here, then sees the
        // order already received and is refused instead of adding the stock a second time.
        bool visible = await dbContext.PurchaseOrders.AsNoTracking()
            .AnyAsync(o => o.Id == command.PurchaseOrderId, cancellationToken)
            .ConfigureAwait(false);
        if (visible)
        {
            _ = await dbContext.Database.SqlQuery<Guid>($"""
                SELECT "Id" FROM purchasing."PurchaseOrders" WHERE "Id" = {command.PurchaseOrderId} FOR UPDATE
                """).ToArrayAsync(cancellationToken).ConfigureAwait(false);
        }

        var result = await ReceiveAsync(command, cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return result;
    }

    private async ValueTask<ReceivePurchaseOrderResult> ReceiveAsync(ReceivePurchaseOrderCommand command, CancellationToken cancellationToken)
    {
        var order = await dbContext.PurchaseOrders
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.Id == command.PurchaseOrderId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Purchase order {command.PurchaseOrderId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(order.BranchId, $"Purchase order {command.PurchaseOrderId} not found.", cancellationToken).ConfigureAwait(false);

        // Goods land at the ordering branch (a caller who can see that branch may receive for it); a legacy
        // order without a branch is received at the caller's current branch, which then becomes its branch.
        Guid receivingBranchId = order.BranchId
            ?? await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        order.AssignLegacyBranch(receivingBranchId);

        var nowUtc = timeProvider.GetUtcNow().UtcDateTime;
        var receiptDateUtc = command.ReceiptDateUtc is { } requested ? ToUtc(requested) : nowUtc;
        if (receiptDateUtc > nowUtc.AddDays(1))
        {
            throw new CustomException(
                "Receipt date cannot be more than one day in the future.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        var inputs = command.Lines ?? Array.Empty<PurchaseOrderLineReceiptInput>();

        // Short delivery first: lines with nothing delivered drop out and need no batch details.
        var receivedByLine = inputs
            .Where(i => i.QuantityReceived is not null)
            .ToDictionary(i => i.LineId, i => i.QuantityReceived!.Value);
        IReadOnlyList<PurchaseOrderShortfall> shortfalls = receivedByLine.Count > 0
            ? order.ApplyReceivedQuantities(receivedByLine)
            : [];

        foreach (var input in inputs.Where(i => i.QuantityReceived is not 0m))
        {
            order.CaptureReceiptDetails(input.LineId, input.BatchNo, input.ExpiryDate, input.SellingPrice);
        }

        // Refused before any stock moves: an order already received (e.g. by a second click) is not received again.
        if (order.Status != PurchaseOrderStatus.Approved)
        {
            throw new CustomException(
                $"Only an approved purchase order can be received (current status: {order.Status}).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        // Every line must have a batch number, expiry and selling price before stock moves.
        order.EnsureReceivable();

        await stockReceiptService.ReceiveAsync(
            new StockReceiptRequest(
                ReferenceType: "PurchaseOrder",
                ReferenceId: order.Id,
                Lines: order.Lines
                    .Select(l => new StockReceiptLine(l.MedicineId, l.BatchNo, l.ExpiryDate, l.Quantity, l.UnitCostPrice, l.SellingPrice!.Value, l.RackLocation))
                    .ToList(),
                BranchId: receivingBranchId,
                JoinCallerTransaction: dbContext.Database.IsRelational()),
            cancellationToken).ConfigureAwait(false);

        PurchaseOrder? backorder = null;
        if (shortfalls.Count > 0)
        {
            if (command.CreateBackorder)
            {
                backorder = PurchaseOrder.CreateBackorder(order, shortfalls, nowUtc);
                dbContext.PurchaseOrders.Add(backorder);
            }

            order.NoteShortReceipt(shortfalls.Count, backorder?.Id);
        }

        order.Receive(currentUser.Name ?? currentUser.GetUserId().ToString(), receiptDateUtc);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        var correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
        await outbox.AddAsync(new PurchaseOrderReceivedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: correlationId,
            Source: "Purchasing",
            PurchaseOrderId: order.Id,
            SupplierId: order.SupplierId,
            TotalAmount: order.TotalAmount,
            OrderDateUtc: order.OrderDateUtc,
            VatAmount: order.TotalVatAmount,
            BranchId: receivingBranchId,
            SupplierInvoiceNumber: order.SupplierInvoiceNumber),
            cancellationToken).ConfigureAwait(false);

        return new ReceivePurchaseOrderResult(order.Id, backorder?.Id, shortfalls.Count);
    }

    private static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}
