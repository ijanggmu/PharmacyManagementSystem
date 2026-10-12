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
using FSH.Modules.Sales.Contracts.Fiscal;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.CreateDirectGoodsReceipt;

/// <summary>
/// Ports <c>postDirectInventorySupplierReceipts</c> (lib/server/services/inventory-supplier-receipt-service.ts):
/// receives stock (Inventory, pre-commit, synchronous — same "must never mark received on a failed
/// receipt" reasoning as <c>ReceivePurchaseOrderCommandHandler</c>) then commits the receipt locally.
/// AP ledger posting (Suppliers) and GL voucher posting (Accounting) are driven asynchronously by
/// <see cref="DirectGoodsReceiptPostedIntegrationEvent"/> via the Outbox.
/// </summary>
public sealed class CreateDirectGoodsReceiptCommandHandler(
    PurchasingDbContext dbContext,
    IStockReceiptService stockReceiptService,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IReceiptNumberService receiptNumbers) : ICommandHandler<CreateDirectGoodsReceiptCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateDirectGoodsReceiptCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var actor = currentUser.Name ?? currentUser.GetUserId().ToString();
        // goods_receipts.branch_id is NOT NULL (scripts 36/42) — a direct receipt is always
        // attributed to exactly one branch, never left unscoped (docs/branch-scoping-plan.md §2).
        var branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        var receipt = DirectGoodsReceipt.Create(command.SupplierId, command.ReceiptDateUtc, command.SupplierInvoiceNumber, actor, branchId);

        var stockLines = new List<StockReceiptLine>();
        foreach (var line in command.Lines)
        {
            // Mirrors the TS service's per-batch filtering (inventory-supplier-receipt-service.ts
            // lines 136 and 195): a zero/negative quantity or a non-positive net line value
            // contributes nothing and is silently dropped rather than rejected outright — a bulk
            // import batch can legitimately contain placeholder rows like this.
            if (line.Quantity <= 0 || line.Quantity * line.UnitCostPrice <= 0)
            {
                continue;
            }

            receipt.AddLine(line.MedicineId, line.Quantity, line.UnitCostPrice, line.VatAmount);
            // No selling price on a direct receipt: a new lot takes the medicine's price (never the cost,
            // which would sell it at no margin).
            stockLines.Add(new StockReceiptLine(
                line.MedicineId, line.BatchNo, line.ExpiryDate, line.Quantity, line.UnitCostPrice, SellingPrice: 0m, line.RackLocation));
        }

        if (receipt.Lines.Count == 0)
        {
            throw new CustomException(
                "A direct goods receipt must have at least one line with a positive quantity and cost.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        // Read before the transaction opens (the branch lives in another module).
        string branchCode = await receiptNumbers.ResolveBranchCodeAsync(branchId, cancellationToken).ConfigureAwait(false);

        // Inventory saves the stock on its own context first: StockReceiptService cannot join a
        // transaction opened here.
        await stockReceiptService.ReceiveAsync(
            new StockReceiptRequest(ReferenceType: "DirectGoodsReceipt", ReferenceId: receipt.Id, Lines: stockLines),
            cancellationToken).ConfigureAwait(false);

        // The serial number, the receipt and its posted event commit together, so a failed save
        // releases the number (no gaps in the series).
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        int fiscalYear = NepalFiscalYear.StartYearFor(receipt.ReceiptDateUtc);
        int sequence = await receiptNumbers.ReserveNextAsync(branchId, fiscalYear, cancellationToken).ConfigureAwait(false);
        receipt.AssignNumber(ReceiptNumberService.Format(branchCode, fiscalYear, sequence), fiscalYear);

        dbContext.DirectGoodsReceipts.Add(receipt);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        var correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
        await outbox.AddAsync(new DirectGoodsReceiptPostedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: correlationId,
            Source: "Purchasing",
            ReceiptId: receipt.Id,
            SupplierId: receipt.SupplierId,
            GrossAmount: receipt.GrossAmount,
            ReceiptDateUtc: receipt.ReceiptDateUtc,
            VatAmount: receipt.VatAmount,
            BranchId: branchId,
            ReceiptNumber: receipt.ReceiptNumber,
            SupplierInvoiceNumber: receipt.SupplierInvoiceNumber,
            Payment: ReceiptPaymentResolver.Resolve(
                command.Payment?.Method, command.Payment?.Amount, command.Payment?.Reference, command.Payment?.PaymentDateUtc,
                receipt.GrossAmount, receipt.ReceiptDateUtc)),
            cancellationToken).ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return receipt.Id;
    }
}
