using System.Data;
using FSH.Framework.Core.Context;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Services;
using FSH.Modules.Sales.Contracts.Fiscal;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CreatePurchaseOrder;

/// <summary>
/// Creates a draft order. Every line's medicine is looked up in Inventory (it must exist and not be archived); lines
/// entered in packs are converted to base units with its units per pack, and each line's VAT is checked against the
/// medicine's VAT status (<see cref="PurchaseLineChecks"/>). The bill discount is applied after every line is added, so
/// it is spread over all of them. The order is numbered <c>PO-{branch}-{fiscal year}-{n}</c> in the same transaction
/// that saves it, and records who raised it (for the second-approver control).
/// </summary>
public sealed class CreatePurchaseOrderCommandHandler(
    PurchasingDbContext dbContext,
    ICurrentBranch currentBranch,
    IMediator mediator,
    IReceiptNumberService numbers,
    ICurrentUser currentUser)
    : ICommandHandler<CreatePurchaseOrderCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreatePurchaseOrderCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // The ordering branch is the one that receives the goods.
        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        await SupplierGuard.EnsureActiveAsync(mediator, command.SupplierId, cancellationToken).ConfigureAwait(false);

        var today = BusinessDateRules.NepalDate(DateTime.UtcNow);
        foreach (var line in command.Lines)
        {
            StockReceiptRules.EnsureNotExpired(line.ExpiryDate, today, $"Batch {line.BatchNo?.Trim() ?? "on this order"}");
        }

        // Read before the transaction opens: the medicines and the VAT rate live in other modules.
        var medicines = await PurchaseLineChecks.LoadMedicinesAsync(
            mediator, command.Lines.Select(l => l.MedicineId), cancellationToken).ConfigureAwait(false);

        var order = PurchaseOrder.CreateDraft(
            command.SupplierId, command.OrderDateUtc, command.Narration, command.SupplierInvoiceNumber, branchId,
            currentUser.GetUserId().ToString());

        foreach (var line in command.Lines)
        {
            var medicine = medicines[line.MedicineId];
            var baseLine = PurchaseLinePacks.ToBase(
                line.Quantity, line.UnitCostPrice, line.FreeQuantity, line.DiscountPercent, line.DiscountAmount,
                line.InPacks, medicine.UnitsPerPack, medicine.Name, line.InBoxes, medicine.PacksPerBox);
            order.AddLine(
                line.MedicineId, line.BatchNo, line.ExpiryDate, baseLine.Quantity,
                baseLine.UnitCostPrice, line.SellingPrice, line.RackLocation, line.VatAmount, baseLine.Terms);
        }

        order.ApplyBillDiscount(command.BillDiscountPercent, command.BillDiscountAmount);

        var vatLines = order.Lines.Select(l => new PurchaseVatLine(l.MedicineId, l.NetAmount, l.VatAmount)).ToList();
        decimal vatRate = await PurchaseLineChecks.VatRatePercentAsync(mediator, vatLines, cancellationToken).ConfigureAwait(false);
        PurchaseLineChecks.EnsureVatMatches(vatLines, medicines, vatRate);

        await SupplierInvoiceGuard.EnsureUnusedAsync(
            dbContext, command.SupplierId, command.SupplierInvoiceNumber, excludePurchaseOrderId: null, cancellationToken)
            .ConfigureAwait(false);

        string branchCode = await numbers.ResolveBranchCodeAsync(branchId, cancellationToken).ConfigureAwait(false);

        var strategy = dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = dbContext.Database.IsRelational()
                ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken).ConfigureAwait(false)
                : null;

            // The number and the order commit together, so a failed save releases the number.
            int fiscalYear = NepalFiscalYear.StartYearFor(order.OrderDateUtc);
            int sequence = await numbers.ReserveNextAsync(branchId, fiscalYear, PurchasingSeries.PurchaseOrder, cancellationToken)
                .ConfigureAwait(false);
            order.AssignNumber(ReceiptNumberService.Format(PurchasingSeries.PurchaseOrder, branchCode, fiscalYear, sequence), fiscalYear);

            dbContext.PurchaseOrders.Add(order);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
            }

            return order.Id;
        }).ConfigureAwait(false);
    }
}
