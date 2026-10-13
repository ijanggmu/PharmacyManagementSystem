using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Ird.GetIrdSalesRegister;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Ird.GetSalesVatSummary;

/// <summary>
/// Totals of the IRD sales register for the VAT return. Selects the same documents on the same dates as
/// <see cref="GetIrdSalesRegisterQueryHandler"/> (invoices by sale date; cancellations by cancellation date;
/// returns by stock-restored date; refunds by accounting-posted date) and uses its
/// <see cref="GetIrdSalesRegisterQueryHandler.VatBreakdown"/> for the taxable/exempt split, but skips the
/// customer lookups — so a period's VAT return sales section equals its register's totals.
/// </summary>
public sealed class GetSalesVatSummaryQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetSalesVatSummaryQuery, SalesVatSummaryDto>
{
    public async ValueTask<SalesVatSummaryDto> Handle(GetSalesVatSummaryQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        DateTime from = query.PeriodStartUtc;
        DateTime to = query.PeriodEndUtc;

        var sales = await dbContext.Sales.AsNoTracking()
            .Include(s => s.Items)
            .Where(s => (s.Status == SaleStatus.Completed || s.Status == SaleStatus.Cancelled)
                && s.SaleDateUtc >= from
                && s.SaleDateUtc <= to
                && (!branchId.HasValue || s.BranchId == branchId.Value))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var cancelled = await dbContext.Sales.AsNoTracking()
            .Include(s => s.Items)
            .Where(s => s.Status == SaleStatus.Cancelled
                && s.CancelledAtUtc != null
                && s.CancelledAtUtc >= from
                && s.CancelledAtUtc <= to
                && (!branchId.HasValue || s.BranchId == branchId.Value))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var returns = await dbContext.SaleReturns.AsNoTracking()
            .Include(r => r.Items)
            .Where(r => r.StockRestoredAtUtc != null
                && r.StockRestoredAtUtc >= from
                && r.StockRestoredAtUtc <= to
                && (!branchId.HasValue || r.BranchId == branchId.Value))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var refunds = await dbContext.SaleRefunds.AsNoTracking()
            .Include(r => r.Items)
            .Where(r => r.AccountingPostedAtUtc != null
                && r.AccountingPostedAtUtc >= from
                && r.AccountingPostedAtUtc <= to
                && (!branchId.HasValue || r.BranchId == branchId.Value))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var gross = new Totals();
        foreach (var s in sales)
        {
            gross.AddSale(s);
        }

        var reversals = new Totals();
        foreach (var s in cancelled)
        {
            reversals.AddSale(s);
        }

        foreach (var r in returns)
        {
            reversals.Add(r.TotalReturnAmount, r.VatAmount, r.TaxableAmount, r.ExemptAmount);
        }

        foreach (var r in refunds)
        {
            reversals.Add(r.RefundAmount + r.TaxRefundAmount, r.VatAmount, r.TaxableAmount, r.ExemptAmount);
        }

        return new SalesVatSummaryDto(
            from,
            to,
            InvoiceCount: sales.Count,
            TaxableSales: gross.Taxable,
            ExemptSales: gross.Exempt,
            OutputVat: gross.Vat,
            ExportSales: 0m,
            UnclassifiedSales: gross.Unclassified - reversals.Unclassified,
            CreditNoteCount: cancelled.Count + returns.Count + refunds.Count,
            ReturnsTaxable: reversals.Taxable,
            ReturnsExempt: reversals.Exempt,
            ReturnsVat: reversals.Vat);
    }

    private sealed class Totals
    {
        public decimal Taxable { get; private set; }
        public decimal Exempt { get; private set; }
        public decimal Vat { get; private set; }
        public decimal Unclassified { get; private set; }

        public void AddSale(Sale sale)
        {
            var (taxable, exempt) = GetIrdSalesRegisterQueryHandler.VatBreakdown(
                sale.TotalAmount, sale.VatAmount, sale.TaxableAmount, sale.ExemptAmount, sale.VatRatePercent);
            Accumulate(sale.TotalAmount, sale.VatAmount, taxable, exempt);
        }

        /// <summary>A credit note: the register shows its stored breakdown as-is (no derivation).</summary>
        public void Add(decimal total, decimal? vat, decimal? taxable, decimal? exempt) =>
            Accumulate(total, vat, taxable, exempt);

        private void Accumulate(decimal total, decimal? vat, decimal? taxable, decimal? exempt)
        {
            if (vat is null && taxable is null && exempt is null)
            {
                Unclassified += total;
                return;
            }

            Vat += vat ?? 0m;
            Taxable += taxable ?? 0m;
            Exempt += exempt ?? 0m;
        }
    }
}
