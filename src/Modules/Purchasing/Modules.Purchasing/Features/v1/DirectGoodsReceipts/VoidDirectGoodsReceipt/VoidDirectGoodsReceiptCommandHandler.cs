using System.Data;
using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.VoidDirectGoodsReceipt;

/// <summary>
/// Ports <c>voidGoodsReceipt</c> (lib/server/services/supplier-return-service.ts). In ONE transaction on the
/// scope's shared connection:
///
/// 1. the receipt row is locked (<c>SELECT ... FOR UPDATE</c>) and its status re-checked, so two concurrent
///    voids (a double click, a retried request) can never both reverse the stock;
/// 2. the stock comes back out of the exact lots this receipt created, at the receipt's own branch, through
///    <see cref="IStockReceiptService.ReverseReceiptAsync"/> (tagged <c>PurchaseReversal</c>, not a sale). If
///    any of those lots no longer holds the quantity (sold, moved or written off since) the void fails with
///    a 409 and nothing moves. Receipts recorded before lot ids were kept fall back to the lots their own
///    <c>Purchase</c> inventory transactions name; receipts with no lot information at all draw from the
///    receipt branch's oldest-expiring lots;
/// 3. a receipt that delivered a purchase order puts that order back to Approved (its row locked too), so the
///    delivery can be received again with the right rate, quantities, batch or bill;
/// 4. the receipt flips to Voided and <see cref="DirectGoodsReceiptVoidedIntegrationEvent"/> is written to
///    the outbox, from which Suppliers (AP) and Accounting (GL) reverse their side asynchronously.
///
/// The caller must be able to see the receipt's branch; otherwise the receipt is reported as not found.
/// </summary>
public sealed class VoidDirectGoodsReceiptCommandHandler(
    PurchasingDbContext dbContext,
    IStockReceiptService stockReceiptService,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<VoidDirectGoodsReceiptCommand, Guid>
{
    public async ValueTask<Guid> Handle(VoidDirectGoodsReceiptCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string notFound = $"Direct goods receipt {command.ReceiptId} not found.";
        var branch = await dbContext.DirectGoodsReceipts
            .AsNoTracking()
            .Where(r => r.Id == command.ReceiptId)
            .Select(r => new { r.BranchId })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException(notFound);
        await currentBranch.EnsureCanSeeBranchAsync(branch.BranchId, notFound, cancellationToken).ConfigureAwait(false);

        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();

        var strategy = dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = dbContext.Database.IsRelational()
                ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken).ConfigureAwait(false)
                : null;

            await PurchasingRowLocks.LockDirectGoodsReceiptAsync(dbContext, command.ReceiptId, cancellationToken).ConfigureAwait(false);

            // Loaded after the lock, so the status is the committed one.
            var receipt = await dbContext.DirectGoodsReceipts
                .Include(r => r.Lines)
                .FirstOrDefaultAsync(r => r.Id == command.ReceiptId, cancellationToken)
                .ConfigureAwait(false)
                ?? throw new NotFoundException(notFound);

            if (receipt.Status != DirectGoodsReceiptStatus.Received)
            {
                throw new CustomException(
                    $"Only a received direct goods receipt can be voided (current status: {receipt.Status}).",
                    (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            }

            await stockReceiptService.ReverseReceiptAsync(
                new StockReceiptReversalRequest(
                    ReferenceType: "DirectGoodsReceiptVoid",
                    ReferenceId: receipt.Id,
                    BranchId: receipt.BranchId,
                    // The lot got the free (bonus) units too, so they come back out with the paid ones.
                    Lines: receipt.Lines.Select(l => new StockReceiptReversalLine(l.MedicineId, l.ReceivedQuantity, l.BatchId)).ToList(),
                    OriginalReferenceType: "DirectGoodsReceipt",
                    OriginalReferenceId: receipt.Id,
                    JoinCallerTransaction: true),
                cancellationToken).ConfigureAwait(false);

            receipt.Void(actor, command.Reason);

            if (receipt.PurchaseOrderId is { } orderId)
            {
                await PurchasingRowLocks.LockPurchaseOrderAsync(dbContext, orderId, cancellationToken).ConfigureAwait(false);
                var order = await dbContext.PurchaseOrders
                    .FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
                    .ConfigureAwait(false);
                order?.ReopenAfterReceiptVoided(receipt.Id);
            }

            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            var correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
            await outbox.AddAsync(new DirectGoodsReceiptVoidedIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: DateTime.UtcNow,
                TenantId: currentUser.GetTenant(),
                CorrelationId: correlationId,
                Source: "Purchasing",
                ReceiptId: receipt.Id,
                SupplierId: receipt.SupplierId,
                GrossAmount: receipt.GrossAmount,
                ReceiptDateUtc: receipt.ReceiptDateUtc,
                Reason: command.Reason,
                ReceiptNumber: receipt.ReceiptNumber,
                BranchId: receipt.BranchId,
                VoidedAtUtc: receipt.VoidedAtUtc),
                cancellationToken).ConfigureAwait(false);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
            }

            return receipt.Id;
        }).ConfigureAwait(false);
    }
}
