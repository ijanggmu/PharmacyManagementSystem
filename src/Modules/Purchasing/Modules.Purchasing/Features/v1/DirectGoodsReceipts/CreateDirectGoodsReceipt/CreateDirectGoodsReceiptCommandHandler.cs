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
/// Ports <c>postDirectInventorySupplierReceipts</c> (lib/server/services/inventory-supplier-receipt-service.ts).
/// The stock (Inventory), the receipt row with the lot each line went into, its serial number and the
/// <see cref="DirectGoodsReceiptPostedIntegrationEvent"/> all commit in ONE transaction opened on the scope's
/// shared connection, which <see cref="IStockReceiptService"/> joins — so stock never lands without its
/// receipt, or the other way round. AP ledger posting (Suppliers) and GL voucher posting (Accounting) are
/// driven asynchronously by the event via the Outbox.
///
/// A new lot is priced at the line's <see cref="DirectGoodsReceiptLineInput.SellingPrice"/>, else the
/// medicine's catalog selling price (only a medicine with no catalog price falls back to the cost, so a lot
/// is never put on sale at zero).
/// </summary>
public sealed class CreateDirectGoodsReceiptCommandHandler(
    PurchasingDbContext dbContext,
    IStockReceiptService stockReceiptService,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IReceiptNumberService receiptNumbers,
    IMediator mediator) : ICommandHandler<CreateDirectGoodsReceiptCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateDirectGoodsReceiptCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var actor = currentUser.Name ?? currentUser.GetUserId().ToString();
        // goods_receipts.branch_id is NOT NULL (scripts 36/42) — a direct receipt is always
        // attributed to exactly one branch, never left unscoped (docs/branch-scoping-plan.md §2).
        var branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        await SupplierGuard.EnsureActiveAsync(mediator, command.SupplierId, cancellationToken).ConfigureAwait(false);

        // A zero-quantity row is a placeholder (bulk imports carry them) and is dropped. A line with a cost of zero is
        // NOT dropped: free samples and bonus stock are real stock — they go in at zero cost (still with their batch
        // and expiry) and simply add nothing to the supplier's bill.
        var postable = command.Lines.Where(l => l.Quantity > 0).ToList();
        if (postable.Count == 0)
        {
            throw new CustomException(
                "A direct goods receipt must have at least one line with a positive quantity.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        var today = BusinessDateRules.NepalDate(DateTime.UtcNow);
        foreach (var line in postable)
        {
            StockReceiptRules.EnsureNotExpired(line.ExpiryDate, today, $"Batch {line.BatchNo?.Trim()}");
        }

        // Every medicine is looked up — also those whose lines carry their own selling price — so an unknown or
        // archived medicine is a 404 here rather than a foreign-key failure (500) inside the stock receipt. The
        // catalog price is the fallback selling price for lines without one. Read before the transaction opens: the
        // medicine lives in another module.
        var medicines = await PurchaseLineChecks.LoadMedicinesAsync(
            mediator, postable.Select(l => l.MedicineId), cancellationToken).ConfigureAwait(false);
        var catalogPrices = medicines.ToDictionary(kv => kv.Key, kv => kv.Value.UnitPrice);
        var packInfo = medicines.ToDictionary(kv => kv.Key, kv => (kv.Value.UnitsPerPack, kv.Value.Name));

        await SupplierInvoiceGuard.EnsureUnusedAsync(
            dbContext, command.SupplierId, command.SupplierInvoiceNumber, excludePurchaseOrderId: null, cancellationToken)
            .ConfigureAwait(false);

        // The VAT check needs each line's taxable value after the bill discount, so it runs on a draft of the
        // receipt; the rate is read only when some line carries VAT.
        decimal vatRate = await PurchaseLineChecks.VatRatePercentAsync(
            mediator, postable.Select(l => new PurchaseVatLine(l.MedicineId, 0m, l.VatAmount)).ToList(), cancellationToken)
            .ConfigureAwait(false);

        // Read before the transaction opens (the branch lives in another module).
        string branchCode = await receiptNumbers.ResolveBranchCodeAsync(branchId, cancellationToken).ConfigureAwait(false);

        var strategy = dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            var receipt = DirectGoodsReceipt.Create(command.SupplierId, command.ReceiptDateUtc, command.SupplierInvoiceNumber, actor, branchId);
            foreach (var line in postable)
            {
                var (unitsPerPack, name) = packInfo[line.MedicineId];
                var baseLine = PurchaseLinePacks.ToBase(
                    line.Quantity, line.UnitCostPrice, line.FreeQuantity, line.DiscountPercent, line.DiscountAmount,
                    line.InPacks, unitsPerPack, name);
                receipt.AddLine(line.MedicineId, baseLine.Quantity, baseLine.UnitCostPrice, line.VatAmount, baseLine.Terms);
            }

            // After every line is in, so the bill discount is spread over all of them before the lots are costed.
            receipt.ApplyBillDiscount(command.BillDiscountPercent, command.BillDiscountAmount);

            PurchaseLineChecks.EnsureVatMatches(
                receipt.Lines.Select(l => new PurchaseVatLine(l.MedicineId, l.NetAmount, l.VatAmount)).ToList(), medicines, vatRate);

            // Paid + free units go into the lot at the effective cost (net after discounts ÷ all units).
            var stockLines = receipt.Lines
                .Select((l, i) => new StockReceiptLine(
                    l.MedicineId, postable[i].BatchNo, postable[i].ExpiryDate, l.ReceivedQuantity, l.EffectiveUnitCost,
                    SellingPriceFor(postable[i], catalogPrices), postable[i].RackLocation, l.FreeQuantity))
                .ToList();

            await using var transaction = dbContext.Database.IsRelational()
                ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken).ConfigureAwait(false)
                : null;

            var received = await stockReceiptService.ReceiveAsync(
                new StockReceiptRequest(
                    ReferenceType: "DirectGoodsReceipt", ReferenceId: receipt.Id, Lines: stockLines,
                    BranchId: branchId, JoinCallerTransaction: true),
                cancellationToken).ConfigureAwait(false);
            receipt.RecordLots(received.Select(r => (r.MedicineId, r.BatchId, r.BatchNo)).ToList());

            // The serial number, the receipt and its posted event commit together, so a failed save
            // releases the number (no gaps in the series).
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
                    receipt.GrossAmount, receipt.ReceiptDateUtc),
                DueDateUtc: command.DueDateUtc),
                cancellationToken).ConfigureAwait(false);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
            }

            return receipt.Id;
        }).ConfigureAwait(false);
    }

    private static decimal SellingPriceFor(DirectGoodsReceiptLineInput line, Dictionary<Guid, decimal> catalogPrices)
    {
        if (line.SellingPrice is { } explicitPrice && explicitPrice > 0m)
        {
            return explicitPrice;
        }

        // The medicine's price; never the cost, which would sell the lot at no margin. With no medicine price
        // either, the lot stays unpriced and a sale refuses it until a price is set.
        return catalogPrices.TryGetValue(line.MedicineId, out var catalogPrice) && catalogPrice > 0
            ? catalogPrice
            : 0m;
    }
}
