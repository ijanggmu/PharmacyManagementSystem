using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Contracts.v1.Reports;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.Reports.GetIrdPurchaseRegister;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.Reports.GetPurchaseVatSummary;

/// <summary>
/// Totals of the IRD purchase register for the VAT return. Selects the same documents on the same dates as
/// <see cref="GetIrdPurchaseRegisterQueryHandler"/> (received orders by receipt date, direct receipts by receipt
/// date — voided ones included in their own period —, receipt voids by void date, supplier debit notes from the
/// Suppliers module by return date) with the same taxable/exempt rule, but skips the supplier-name lookups.
/// </summary>
public sealed class GetPurchaseVatSummaryQueryHandler(PurchasingDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetPurchaseVatSummaryQuery, PurchaseVatSummaryDto>
{
    public async ValueTask<PurchaseVatSummaryDto> Handle(GetPurchaseVatSummaryQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        DateTime from = query.PeriodStartUtc;
        DateTime to = query.PeriodEndUtc;

        var orders = await dbContext.PurchaseOrders.AsNoTracking()
            .Include(o => o.Lines)
            .Where(o => o.Status == PurchaseOrderStatus.Received
                && (o.ReceivedAtUtc ?? o.OrderDateUtc) >= from
                && (o.ReceivedAtUtc ?? o.OrderDateUtc) <= to
                && (branchId == null || o.BranchId == branchId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var receipts = await dbContext.DirectGoodsReceipts.AsNoTracking()
            .Include(r => r.Lines)
            .Where(r => (r.Status == DirectGoodsReceiptStatus.Received || r.Status == DirectGoodsReceiptStatus.Voided)
                && r.ReceiptDateUtc >= from && r.ReceiptDateUtc <= to
                && (branchId == null || r.BranchId == branchId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var voidedReceipts = await dbContext.DirectGoodsReceipts.AsNoTracking()
            .Include(r => r.Lines)
            .Where(r => r.Status == DirectGoodsReceiptStatus.Voided
                && r.VoidedAtUtc != null
                && r.VoidedAtUtc >= from && r.VoidedAtUtc <= to
                && (branchId == null || r.BranchId == branchId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var debitNotes = await mediator.Send(new GetSupplierDebitNotesQuery(from, to, branchId), cancellationToken)
            .ConfigureAwait(false);

        var orderLines = orders.SelectMany(o => o.Lines.Select(l => (Net: l.Quantity * l.UnitCostPrice, l.VatAmount))).ToList();
        var receiptLines = receipts.SelectMany(r => r.Lines.Select(l => (Net: l.NetAmount, l.VatAmount))).ToList();
        var voidLines = voidedReceipts.SelectMany(r => r.Lines.Select(l => (Net: l.NetAmount, l.VatAmount))).ToList();

        return new PurchaseVatSummaryDto(
            from,
            to,
            BillCount: orders.Count + receipts.Count,
            TaxablePurchases: GetIrdPurchaseRegisterQueryHandler.TaxableNet(orderLines.Concat(receiptLines)),
            ExemptPurchases: GetIrdPurchaseRegisterQueryHandler.ExemptNet(orderLines.Concat(receiptLines)),
            InputVat: orderLines.Concat(receiptLines).Sum(l => l.VatAmount),
            ImportPurchases: 0m,
            ImportVat: 0m,
            DebitNoteCount: debitNotes.Count + voidedReceipts.Count,
            DebitNotesTaxable: debitNotes.Sum(d => d.TaxableAmount) + GetIrdPurchaseRegisterQueryHandler.TaxableNet(voidLines),
            DebitNotesExempt: debitNotes.Sum(d => d.ExemptAmount) + GetIrdPurchaseRegisterQueryHandler.ExemptNet(voidLines),
            DebitNotesVat: debitNotes.Sum(d => d.VatAmount) + voidLines.Sum(l => l.VatAmount));
    }
}
