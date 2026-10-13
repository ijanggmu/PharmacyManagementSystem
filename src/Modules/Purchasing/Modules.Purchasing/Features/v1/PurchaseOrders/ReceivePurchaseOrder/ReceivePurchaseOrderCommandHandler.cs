using System.Data;
using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ReceivePurchaseOrder;

/// <summary>
/// Receives an approved order atomically. A transaction is opened on the scope's shared connection FIRST;
/// the order row is locked (SELECT ... FOR UPDATE) and re-read, so a concurrent receive (double click,
/// retried request) or cancel waits and then sees the order is no longer Approved. Inside that one
/// transaction: the stock (Inventory, joining it), the order's Received status, an optional backorder and
/// the <see cref="PurchaseOrderReceivedIntegrationEvent"/> outbox row all commit together — stock is never
/// added for an order that is not marked received, or the other way round.
///
/// AP ledger posting (Suppliers) and GL voucher posting (Accounting) are driven asynchronously by the event
/// via the Outbox (docs/pharmacy-modules-plan.md §2); the event carries the receipt date so both can be dated
/// by when the goods arrived. A short delivery cuts the order down to what arrived first, so stock, AP and GL
/// all see the delivered amounts; the undelivered balance optionally becomes a new draft backorder in the
/// same save.
/// </summary>
public sealed class ReceivePurchaseOrderCommandHandler(
    PurchasingDbContext dbContext,
    IStockReceiptService stockReceiptService,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider,
    IMediator mediator) : ICommandHandler<ReceivePurchaseOrderCommand, ReceivePurchaseOrderResult>
{
    public async ValueTask<ReceivePurchaseOrderResult> Handle(ReceivePurchaseOrderCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string notFound = $"Purchase order {command.PurchaseOrderId} not found.";
        var header = await dbContext.PurchaseOrders
            .AsNoTracking()
            .Where(o => o.Id == command.PurchaseOrderId)
            .Select(o => new { o.BranchId, o.SupplierId })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException(notFound);
        await currentBranch.EnsureCanSeeBranchAsync(header.BranchId, notFound, cancellationToken).ConfigureAwait(false);

        // Goods land at the ordering branch (a caller who can see that branch may receive for it); a legacy
        // order without a branch is received at the caller's current branch, which then becomes its branch.
        Guid receivingBranchId = header.BranchId
            ?? await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        await SupplierGuard.EnsureActiveAsync(mediator, header.SupplierId, cancellationToken).ConfigureAwait(false);

        var nowUtc = timeProvider.GetUtcNow().UtcDateTime;
        var receiptDateUtc = command.ReceiptDateUtc is { } requested ? ToUtc(requested) : nowUtc;
        if (receiptDateUtc > nowUtc.AddDays(1))
        {
            throw new CustomException(
                "Receipt date cannot be more than one day in the future.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();
        var inputs = command.Lines ?? Array.Empty<PurchaseOrderLineReceiptInput>();

        var strategy = dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = dbContext.Database.IsRelational()
                ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken).ConfigureAwait(false)
                : null;

            await PurchasingRowLocks.LockPurchaseOrderAsync(dbContext, command.PurchaseOrderId, cancellationToken).ConfigureAwait(false);

            // Loaded after the lock, so the status is the committed one.
            var order = await dbContext.PurchaseOrders
                .Include(o => o.Lines)
                .FirstOrDefaultAsync(o => o.Id == command.PurchaseOrderId, cancellationToken)
                .ConfigureAwait(false)
                ?? throw new NotFoundException(notFound);

            if (order.Status != PurchaseOrderStatus.Approved)
            {
                throw new CustomException(
                    $"Only an approved purchase order can be received (current status: {order.Status}).",
                    (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            }

            order.AssignLegacyBranch(receivingBranchId);

            // Short delivery first: lines with nothing delivered drop out and need no batch details.
            var receivedByLine = inputs
                .Where(i => i.QuantityReceived is not null)
                .ToDictionary(i => i.LineId, i => i.QuantityReceived!.Value);
            var freeReceivedByLine = inputs
                .Where(i => i.FreeQuantityReceived is not null)
                .ToDictionary(i => i.LineId, i => i.FreeQuantityReceived!.Value);
            IReadOnlyList<PurchaseOrderShortfall> shortfalls = receivedByLine.Count > 0 || freeReceivedByLine.Count > 0
                ? order.ApplyReceivedQuantities(receivedByLine, freeReceivedByLine)
                : [];

            foreach (var input in inputs.Where(i => i.QuantityReceived is not 0m))
            {
                order.CaptureReceiptDetails(input.LineId, input.BatchNo, input.ExpiryDate, input.SellingPrice);
            }

            // Every line must have a batch number, expiry and selling price before stock moves.
            order.EnsureReceivable();

            await stockReceiptService.ReceiveAsync(
                new StockReceiptRequest(
                    ReferenceType: "PurchaseOrder",
                    ReferenceId: order.Id,
                    Lines: order.Lines
                        // Paid + free units go into the lot at the effective cost (net ÷ all units), so the
                        // bonus stock carries its share of the cost and the lot is valued at what was paid.
                        .Select(l => new StockReceiptLine(
                            l.MedicineId, l.BatchNo, l.ExpiryDate, l.ReceivedQuantity, l.EffectiveUnitCost,
                            l.SellingPrice!.Value, l.RackLocation, l.FreeQuantity))
                        .ToList(),
                    BranchId: receivingBranchId,
                    JoinCallerTransaction: true),
                cancellationToken).ConfigureAwait(false);

            PurchaseOrder? backorder = null;
            if (shortfalls.Count > 0)
            {
                // Undelivered free goods alone are not reordered.
                if (command.CreateBackorder && shortfalls.Any(s => s.Quantity > 0m))
                {
                    backorder = PurchaseOrder.CreateBackorder(order, shortfalls, nowUtc);
                    dbContext.PurchaseOrders.Add(backorder);
                }

                order.NoteShortReceipt(shortfalls.Count, backorder?.Id);
            }

            order.Receive(actor, receiptDateUtc);
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
                SupplierInvoiceNumber: order.SupplierInvoiceNumber,
                ReceivedAtUtc: order.ReceivedAtUtc),
                cancellationToken).ConfigureAwait(false);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
            }

            return new ReceivePurchaseOrderResult(order.Id, backorder?.Id, shortfalls.Count);
        }).ConfigureAwait(false);
    }

    private static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}
