using System.Data;
using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.VoidDirectGoodsReceipt;

/// <summary>
/// Ports <c>voidGoodsReceipt</c> (lib/server/services/supplier-return-service.ts): takes back the stock
/// this receipt added — out of the exact batches it went into, at the receipt's branch and cost
/// (<see cref="IStockReceiptService.ReverseReceiptAsync"/>), never other lots picked by expiry — and flips
/// the receipt to Voided, all in one transaction with the receipt row locked. If any of those batches no
/// longer holds what the receipt added (part was sold or used), nothing changes and the void answers 409
/// (<c>InsufficientStockException</c>). AP ledger reversal
/// (Suppliers) and GL voucher void (Accounting) are driven asynchronously by
/// <see cref="DirectGoodsReceiptVoidedIntegrationEvent"/> via the Outbox — same split as
/// <c>ReceivePurchaseOrderCommandHandler</c>/<c>CancelSaleCommandHandler</c>.
/// </summary>
public sealed class VoidDirectGoodsReceiptCommandHandler(
    PurchasingDbContext dbContext,
    IStockReceiptService stockReceiptService,
    IOutboxWriter outbox,
    ICurrentUser currentUser) : ICommandHandler<VoidDirectGoodsReceiptCommand, Guid>
{
    public async ValueTask<Guid> Handle(VoidDirectGoodsReceiptCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (!dbContext.Database.IsRelational())
        {
            return await VoidAsync(command, cancellationToken).ConfigureAwait(false);
        }

        // One transaction for the stock (Inventory joins it on the shared connection), the receipt and the
        // outbox event. The receipt row is locked first, so a double-clicked void waits and is then refused.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        bool visible = await dbContext.DirectGoodsReceipts.AsNoTracking()
            .AnyAsync(r => r.Id == command.ReceiptId, cancellationToken)
            .ConfigureAwait(false);
        if (visible)
        {
            _ = await dbContext.Database.SqlQuery<Guid>($@"SELECT ""Id"" FROM purchasing.""DirectGoodsReceipts"" WHERE ""Id"" = {command.ReceiptId} FOR UPDATE")
                .ToArrayAsync(cancellationToken).ConfigureAwait(false);
        }

        var result = await VoidAsync(command, cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return result;
    }

    private async ValueTask<Guid> VoidAsync(VoidDirectGoodsReceiptCommand command, CancellationToken cancellationToken)
    {
        var receipt = await dbContext.DirectGoodsReceipts
            .Include(r => r.Lines)
            .FirstOrDefaultAsync(r => r.Id == command.ReceiptId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Direct goods receipt {command.ReceiptId} not found.");

        // Checked BEFORE the stock reversal so an already-voided (or never-received) receipt fails
        // fast without attempting a second deduction against it.
        if (receipt.Status != DirectGoodsReceiptStatus.Received)
        {
            throw new CustomException(
                $"Only a received direct goods receipt can be voided (current status: {receipt.Status}).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        await stockReceiptService.ReverseReceiptAsync(
            new StockReceiptReversalRequest(
                ReferenceType: "DirectGoodsReceipt",
                ReferenceId: receipt.Id,
                ReversalReferenceType: "DirectGoodsReceiptVoid",
                ReversalReferenceId: receipt.Id,
                JoinCallerTransaction: dbContext.Database.IsRelational()),
            cancellationToken).ConfigureAwait(false);

        receipt.Void(currentUser.Name ?? currentUser.GetUserId().ToString(), command.Reason);
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
            BranchId: receipt.BranchId),
            cancellationToken).ConfigureAwait(false);

        return receipt.Id;
    }
}
