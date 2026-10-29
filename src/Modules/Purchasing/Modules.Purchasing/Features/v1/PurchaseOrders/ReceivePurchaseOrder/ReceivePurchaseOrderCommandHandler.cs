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
using FSH.Modules.Sales.Contracts.Fiscal;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ReceivePurchaseOrder;

/// <summary>
/// Receives an approved order atomically, booking the delivery as a goods receipt (GRN) linked to the order — the
/// same document a direct receipt is, so every delivery has one number, one void and one supplier bill. A
/// transaction is opened on the scope's shared connection FIRST; the order row is locked (SELECT ... FOR UPDATE)
/// and re-read, so a concurrent receive (double click, retried request) or cancel waits and then sees the order is
/// no longer Approved. Inside that one transaction: the stock (Inventory, joining it, recorded against the receipt
/// and its lots), the numbered receipt, the order's Received status, an optional backorder and the
/// <see cref="DirectGoodsReceiptPostedIntegrationEvent"/> outbox row all commit together.
///
/// What arrived wins over the order: the batch, expiry and selling price typed at receipt replace the order's,
/// and the receipt takes the delivered paid and free quantities and the billed rate (see
/// <see cref="PurchaseOrderLineReceiptInput"/>). AP ledger posting (Suppliers) and GL voucher posting
/// (Accounting) follow from the event via the Outbox, dated by the receipt date. A short delivery cuts the order
/// down to what arrived first; the undelivered balance optionally becomes a new draft backorder in the same save.
/// </summary>
public sealed class ReceivePurchaseOrderCommandHandler(
    PurchasingDbContext dbContext,
    IStockReceiptService stockReceiptService,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider,
    IMediator mediator,
    IReceiptNumberService numbers) : ICommandHandler<ReceivePurchaseOrderCommand, ReceivePurchaseOrderResult>
{
    public async ValueTask<ReceivePurchaseOrderResult> Handle(ReceivePurchaseOrderCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string notFound = $"Purchase order {command.PurchaseOrderId} not found.";
        var header = await dbContext.PurchaseOrders
            .AsNoTracking()
            .Where(o => o.Id == command.PurchaseOrderId)
            .Select(o => new { o.BranchId, o.SupplierId, o.SupplierInvoiceNumber })
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

        // Read before the transaction opens (other modules): every line's medicine must still exist and not be
        // archived, the VAT rate checks the lines' VAT, and the branch code numbers a backorder.
        var orderLines = await dbContext.PurchaseOrderLines
            .AsNoTracking()
            .Where(l => l.PurchaseOrderId == command.PurchaseOrderId)
            .Select(l => new { l.MedicineId, l.VatAmount })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var medicines = await PurchaseLineChecks.LoadMedicinesAsync(
            mediator, orderLines.Select(l => l.MedicineId), cancellationToken).ConfigureAwait(false);
        decimal vatRate = await PurchaseLineChecks.VatRatePercentAsync(
            mediator, orderLines.Select(l => new PurchaseVatLine(l.MedicineId, 0m, l.VatAmount)).ToList(), cancellationToken)
            .ConfigureAwait(false);
        // A bill number typed at receipt (it usually comes with the goods) replaces the one on the order.
        string? supplierInvoiceNumber = string.IsNullOrWhiteSpace(command.SupplierInvoiceNumber)
            ? header.SupplierInvoiceNumber
            : command.SupplierInvoiceNumber.Trim();
        await SupplierInvoiceGuard.EnsureUnusedAsync(
            dbContext, header.SupplierId, supplierInvoiceNumber, command.PurchaseOrderId, cancellationToken)
            .ConfigureAwait(false);
        string branchCode = await numbers.ResolveBranchCodeAsync(receivingBranchId, cancellationToken).ConfigureAwait(false);
        var today = BusinessDateRules.NepalDate(nowUtc);

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
            order.CaptureSupplierInvoiceNumber(command.SupplierInvoiceNumber);

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

            // Every line must have a batch number, expiry and selling price before stock moves, the expiry must not
            // be past, and the VAT must still fit each medicine (short lines carry their share of it).
            order.EnsureReceivable();
            foreach (var line in order.Lines)
            {
                StockReceiptRules.EnsureNotExpired(line.ExpiryDate, today, $"Batch {line.BatchNo}");
            }

            PurchaseLineChecks.EnsureVatMatches(
                order.Lines.Select(l => new PurchaseVatLine(l.MedicineId, l.NetAmount, l.VatAmount)).ToList(), medicines, vatRate);

            var receipt = BuildReceipt(order, inputs, receiptDateUtc, actor, receivingBranchId);

            PurchaseLineChecks.EnsureVatMatches(
                receipt.Lines.Select(l => new PurchaseVatLine(l.MedicineId, l.NetAmount, l.VatAmount)).ToList(), medicines, vatRate);

            // Paid + free units go into the lot at the effective cost (net ÷ all units), so the bonus stock carries
            // its share of the cost and the lot is valued at what was paid. Receipt line i is order line i.
            var orderLines = order.Lines;
            var received = await stockReceiptService.ReceiveAsync(
                new StockReceiptRequest(
                    ReferenceType: "DirectGoodsReceipt",
                    ReferenceId: receipt.Id,
                    Lines: receipt.Lines
                        .Select((l, i) => new StockReceiptLine(
                            l.MedicineId, orderLines[i].BatchNo, orderLines[i].ExpiryDate, l.ReceivedQuantity,
                            l.EffectiveUnitCost, orderLines[i].SellingPrice!.Value, orderLines[i].RackLocation, l.FreeQuantity))
                        .ToList(),
                    BranchId: receivingBranchId,
                    JoinCallerTransaction: true),
                cancellationToken).ConfigureAwait(false);
            receipt.RecordLots(received.Select(r => (r.MedicineId, r.BatchId, r.BatchNo)).ToList());

            // The receipt's serial commits with it, so a failed save releases the number (no gaps in the series).
            int receiptFiscalYear = NepalFiscalYear.StartYearFor(receipt.ReceiptDateUtc);
            int receiptSequence = await numbers.ReserveNextAsync(receivingBranchId, receiptFiscalYear, cancellationToken)
                .ConfigureAwait(false);
            receipt.AssignNumber(ReceiptNumberService.Format(branchCode, receiptFiscalYear, receiptSequence), receiptFiscalYear);
            dbContext.DirectGoodsReceipts.Add(receipt);

            PurchaseOrder? backorder = null;
            if (shortfalls.Count > 0)
            {
                // Undelivered free goods alone are not reordered.
                if (command.CreateBackorder && shortfalls.Any(s => s.Quantity > 0m))
                {
                    backorder = PurchaseOrder.CreateBackorder(order, shortfalls, nowUtc, currentUser.GetUserId().ToString());
                    int fiscalYear = NepalFiscalYear.StartYearFor(backorder.OrderDateUtc);
                    int sequence = await numbers.ReserveNextAsync(
                        receivingBranchId, fiscalYear, PurchasingSeries.PurchaseOrder, cancellationToken).ConfigureAwait(false);
                    backorder.AssignNumber(
                        ReceiptNumberService.Format(PurchasingSeries.PurchaseOrder, branchCode, fiscalYear, sequence), fiscalYear);
                    dbContext.PurchaseOrders.Add(backorder);
                }

                order.NoteShortReceipt(shortfalls.Count, backorder?.DisplayNumber);
            }

            order.Receive(actor, receiptDateUtc, receipt.Id);
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
                BranchId: receivingBranchId,
                ReceiptNumber: receipt.ReceiptNumber,
                SupplierInvoiceNumber: receipt.SupplierInvoiceNumber,
                DueDateUtc: command.DueDateUtc is { } dueDate ? ToUtc(dueDate) : null),
                cancellationToken).ConfigureAwait(false);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
            }

            return new ReceivePurchaseOrderResult(order.Id, backorder?.Id, shortfalls.Count, receipt.Id, receipt.ReceiptNumber);
        }).ConfigureAwait(false);
    }

    /// <summary>
    /// The goods receipt for what arrived: one receipt line per (already cut-down) order line, in order, with the
    /// delivered paid and free quantities and the billed rate. While the rate is the ordered one, the line keeps its
    /// order discount, bill-discount share and VAT exactly. A changed rate re-works a percent line discount on the
    /// new gross, a percent bill discount on the new total, and scales the line's VAT by its new taxable value over
    /// the old (VAT follows the taxable value, so a VAT-free line stays VAT-free).
    /// </summary>
    internal static DirectGoodsReceipt BuildReceipt(
        PurchaseOrder order, IReadOnlyList<PurchaseOrderLineReceiptInput> inputs, DateTime receiptDateUtc, string actor,
        Guid branchId)
    {
        var rates = inputs
            .Where(i => i.Rate is not null)
            .ToDictionary(i => i.LineId, i => i.Rate!.Value);
        bool RateChanged(PurchaseOrderLine line) =>
            rates.TryGetValue(line.Id, out decimal rate) && rate != (line.PackUnitCost ?? line.UnitCostPrice);
        bool anyRateChanged = order.Lines.Any(RateChanged);
        var receiptId = Guid.CreateVersion7();

        DirectGoodsReceipt Build(Func<PurchaseOrderLine, int, decimal> vatFor)
        {
            var draft = DirectGoodsReceipt.Create(
                order.SupplierId, receiptDateUtc, order.SupplierInvoiceNumber, actor, branchId, receiptId, order.Id);
            for (int i = 0; i < order.Lines.Count; i++)
            {
                var line = order.Lines[i];
                decimal unitCost = line.UnitCostPrice;
                decimal? packUnitCost = line.PackUnitCost;
                decimal discountAmount = line.DiscountAmount;
                if (RateChanged(line))
                {
                    decimal rate = rates[line.Id];
                    if (line.PackSize is > 0m)
                    {
                        packUnitCost = rate;
                        unitCost = PurchaseLineMath.Round(rate / line.PackSize.Value);
                    }
                    else
                    {
                        unitCost = rate;
                    }

                    // A percent discount follows the new gross; a fixed amount stays as agreed.
                    if (line.DiscountPercent > 0m)
                    {
                        discountAmount = 0m;
                    }
                }

                draft.AddLine(
                    line.MedicineId, line.Quantity, unitCost, vatFor(line, i),
                    new PurchaseLineTerms(line.FreeQuantity, line.DiscountPercent, discountAmount, line.PackSize, packUnitCost));
            }

            // Unchanged rates keep the delivered bill discount exactly; with a changed rate a percent bill discount is
            // worked out again on the new total (a fixed amount stays).
            bool recomputeBillDiscount = anyRateChanged && order.BillDiscountPercent > 0m;
            draft.ApplyBillDiscount(order.BillDiscountPercent, recomputeBillDiscount ? 0m : order.BillDiscountAmount);
            return draft;
        }

        if (!anyRateChanged)
        {
            return Build((line, _) => line.VatAmount);
        }

        // The VAT is scaled by each line's new taxable value, which is known only once the discounts are spread.
        var nets = Build((line, _) => line.VatAmount).Lines.Select(l => l.NetAmount).ToList();
        return Build((line, i) => !RateChanged(line) || line.NetAmount <= 0m
            ? line.VatAmount
            : PurchaseLineMath.Round(line.VatAmount * nets[i] / line.NetAmount));
    }

    private static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}
