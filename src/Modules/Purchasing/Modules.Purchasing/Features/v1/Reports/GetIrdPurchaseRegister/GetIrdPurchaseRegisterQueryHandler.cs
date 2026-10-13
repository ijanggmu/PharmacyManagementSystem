using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Contracts.v1.Reports;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.Reports.GetIrdPurchaseRegister;

/// <summary>
/// .NET port of the <c>purchase-register</c>/<c>annex-14</c> report types from the Next.js reference's
/// <c>getIrdReportRows</c> (lib/server/services/reports-service.ts). Composes across modules through a
/// Contracts-only Mediator query (architecture.md) for the supplier name, same batched-lookup pattern as
/// <c>GetReorderSuggestionsQueryHandler</c>. Branch-scoped like the Sales-side IRD
/// report (explicit branch for ViewAll callers, otherwise the caller's own). Received
/// <see cref="DirectGoodsReceipt"/>s (purchases without a PO: add/bulk-import medicine with a supplier,
/// manual receipts) are included alongside the received orders. A voided receipt keeps its original row in
/// the period it was received in (that period's return is already filed) and adds a negative row dated at
/// the void — the same treatment as a debit note. Taxable is the VAT-bearing net only; lines that carried no
/// input VAT are reported as exempt.
/// </summary>
public sealed class GetIrdPurchaseRegisterQueryHandler(PurchasingDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetIrdPurchaseRegisterQuery, IReadOnlyList<IrdPurchaseRegisterRowDto>>
{
    public async ValueTask<IReadOnlyList<IrdPurchaseRegisterRowDto>> Handle(
        GetIrdPurchaseRegisterQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Same branch rule as the IRD sales register: ViewAll callers pick a branch or all; others get theirs.
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        // Only received orders are purchases for VAT: a draft, approved or cancelled order has no bill.
        // They are dated by when the goods and bill came in (ReceivedAtUtc, set from the receipt date),
        // not when the order was raised.
        var orders = await dbContext.PurchaseOrders.AsNoTracking()
            .Include(o => o.Lines)
            .Where(o => o.Status == PurchaseOrderStatus.Received
                && (o.ReceivedAtUtc ?? o.OrderDateUtc) >= query.PeriodStartUtc
                && (o.ReceivedAtUtc ?? o.OrderDateUtc) <= query.PeriodEndUtc
                && (branchId == null || o.BranchId == branchId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Received AND voided receipts dated in the period: a later void does not take the purchase out of
        // the period it was billed in.
        var receipts = await dbContext.DirectGoodsReceipts.AsNoTracking()
            .Include(r => r.Lines)
            .Where(r => (r.Status == DirectGoodsReceiptStatus.Received || r.Status == DirectGoodsReceiptStatus.Voided)
                && r.ReceiptDateUtc >= query.PeriodStartUtc && r.ReceiptDateUtc <= query.PeriodEndUtc
                && (branchId == null || r.BranchId == branchId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Voids that happened in the period, whenever the receipt itself was dated: negative rows.
        var voidedReceipts = await dbContext.DirectGoodsReceipts.AsNoTracking()
            .Include(r => r.Lines)
            .Where(r => r.Status == DirectGoodsReceiptStatus.Voided
                && r.VoidedAtUtc != null
                && r.VoidedAtUtc >= query.PeriodStartUtc && r.VoidedAtUtc <= query.PeriodEndUtc
                && (branchId == null || r.BranchId == branchId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Debit notes (goods returned to suppliers) reduce purchases and input VAT: negative rows.
        var debitNotes = await mediator.Send(
            new GetSupplierDebitNotesQuery(query.PeriodStartUtc, query.PeriodEndUtc, branchId), cancellationToken)
            .ConfigureAwait(false);

        if (orders.Count == 0 && receipts.Count == 0 && voidedReceipts.Count == 0 && debitNotes.Count == 0)
        {
            return [];
        }

        var supplierIds = orders.Select(o => o.SupplierId)
            .Concat(receipts.Select(r => r.SupplierId))
            .Concat(voidedReceipts.Select(r => r.SupplierId))
            .Concat(debitNotes.Select(d => d.SupplierId))
            .Distinct()
            .ToList();
        var supplierNames = await LoadSupplierNamesAsync(supplierIds, cancellationToken).ConfigureAwait(false);

        var orderRows = orders.Select(o => new IrdPurchaseRegisterRowDto(
            o.Id,
            o.ReceivedAtUtc ?? o.OrderDateUtc,
            o.SupplierId,
            supplierNames.GetValueOrDefault(o.SupplierId, "—"),
            o.SupplierInvoiceNumber,
            o.TotalAmount + o.TotalVatAmount,
            o.Status.ToString(),
            IrdPurchaseRegisterRowDto.PurchaseOrderSource,
            TaxableNet(o.Lines.Select(l => (l.Quantity * l.UnitCostPrice, l.VatAmount))),
            o.TotalVatAmount,
            ExemptNet(o.Lines.Select(l => (l.Quantity * l.UnitCostPrice, l.VatAmount)))));

        var receiptRows = receipts.Select(r => new IrdPurchaseRegisterRowDto(
            r.Id,
            r.ReceiptDateUtc,
            r.SupplierId,
            supplierNames.GetValueOrDefault(r.SupplierId, "—"),
            r.SupplierInvoiceNumber,
            r.GrossAmount,
            r.Status.ToString(),
            IrdPurchaseRegisterRowDto.DirectGoodsReceiptSource,
            TaxableNet(r.Lines.Select(l => (l.NetAmount, l.VatAmount))),
            r.VatAmount,
            ExemptNet(r.Lines.Select(l => (l.NetAmount, l.VatAmount)))));

        var voidRows = voidedReceipts.Select(r => new IrdPurchaseRegisterRowDto(
            r.Id,
            r.VoidedAtUtc!.Value,
            r.SupplierId,
            supplierNames.GetValueOrDefault(r.SupplierId, "—"),
            r.SupplierInvoiceNumber,
            -r.GrossAmount,
            r.Status.ToString(),
            IrdPurchaseRegisterRowDto.DirectGoodsReceiptVoidSource,
            -TaxableNet(r.Lines.Select(l => (l.NetAmount, l.VatAmount))),
            -r.VatAmount,
            -ExemptNet(r.Lines.Select(l => (l.NetAmount, l.VatAmount)))));

        var debitNoteRows = debitNotes.Select(d => new IrdPurchaseRegisterRowDto(
            d.Id,
            d.ReturnDateUtc,
            d.SupplierId,
            supplierNames.GetValueOrDefault(d.SupplierId, "—"),
            d.DocumentNumber ?? d.SupplierInvoiceNumber,
            -(d.TaxableAmount + d.ExemptAmount + d.VatAmount),
            "DebitNote",
            IrdPurchaseRegisterRowDto.DebitNoteSource,
            -d.TaxableAmount,
            -d.VatAmount,
            -d.ExemptAmount));

        return orderRows.Concat(receiptRows).Concat(voidRows).Concat(debitNoteRows)
            .OrderBy(row => row.OrderDateUtc)
            .ToList();
    }

    // A line that carried input VAT is a taxable purchase; one with none is a VAT-exempt purchase (the
    // medicine's IsTaxable flag is what decided the VAT when the line was recorded).
    internal static decimal TaxableNet(IEnumerable<(decimal Net, decimal Vat)> lines) =>
        lines.Where(l => l.Vat > 0).Sum(l => l.Net);

    internal static decimal ExemptNet(IEnumerable<(decimal Net, decimal Vat)> lines) =>
        lines.Where(l => l.Vat <= 0).Sum(l => l.Net);

    private async Task<Dictionary<Guid, string>> LoadSupplierNamesAsync(IReadOnlyList<Guid> supplierIds, CancellationToken ct)
    {
        var result = new Dictionary<Guid, string>();
        foreach (var id in supplierIds)
        {
            try
            {
                var supplier = await mediator.Send(new GetSupplierByIdQuery(id), ct).ConfigureAwait(false);
                result[id] = supplier.Name;
            }
            catch (NotFoundException)
            {
                // Supplier since deleted/purged — leave unresolved rather than fail the whole report.
            }
        }

        return result;
    }
}
