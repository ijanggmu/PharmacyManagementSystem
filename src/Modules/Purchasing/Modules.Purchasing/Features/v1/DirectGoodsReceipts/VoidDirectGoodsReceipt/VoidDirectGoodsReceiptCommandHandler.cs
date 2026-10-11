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
/// Ports <c>voidGoodsReceipt</c> (lib/server/services/supplier-return-service.ts): reverses the stock
/// this receipt added and only THEN flips it to Voided, so a reversal that can't fully succeed (e.g.
/// the stock was already partly sold on) never leaves the receipt marked voided without the stock
/// actually having moved back. The stock reversal reuses <see cref="IStockDeductionService"/>'s
/// generic deduction surface — its own doc comment calls out "Sales (and later Purchasing return
/// flows)" as callers — with <c>InsufficientStockException</c> (409) as the natural analogue of the
/// TS source's "Insufficient stock for medicine ... at this branch" guard. AP ledger reversal
/// (Suppliers) and GL voucher void (Accounting) are driven asynchronously by
/// <see cref="DirectGoodsReceiptVoidedIntegrationEvent"/> via the Outbox — same split as
/// <c>ReceivePurchaseOrderCommandHandler</c>/<c>CancelSaleCommandHandler</c>.
/// </summary>
public sealed class VoidDirectGoodsReceiptCommandHandler(
    PurchasingDbContext dbContext,
    IStockDeductionService stockDeductionService,
    IOutboxWriter outbox,
    ICurrentUser currentUser) : ICommandHandler<VoidDirectGoodsReceiptCommand, Guid>
{
    public async ValueTask<Guid> Handle(VoidDirectGoodsReceiptCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

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

        await stockDeductionService.DeductForSaleAsync(
            new StockDeductionRequest(
                ReferenceType: "DirectGoodsReceiptVoid",
                ReferenceId: receipt.Id,
                Lines: receipt.Lines.Select(l => new StockDeductionLine(l.MedicineId, l.Quantity)).ToList()),
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
