using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Ird.GetIrdSalesRegister;

/// <summary>
/// .NET port of the <c>sales-register</c>/<c>annex-13</c> report types from the Next.js reference's
/// <c>getIrdReportRows</c> (lib/server/services/reports-service.ts). Composes across modules through a
/// Contracts-only Mediator query (architecture.md), same batched-lookup pattern as
/// <c>GetNarcoticRegisterQueryHandler</c>. Branch-scoped like other Sales report queries via
/// <see cref="ICurrentBranch.ResolveListBranchFilterAsync"/>.
///
/// <para>A register must not be rewritten after the fact: an invoice stays in the period it was issued, even
/// if it is cancelled later (it used to vanish, so a filed period's register stopped matching its VAT return).
/// What reverses it is reported where it happened, the way the purchase register reports debit notes:
/// a cancellation, a completed return and a completed refund each add a NEGATIVE row dated when it was recorded
/// (cancelled / stock restored / refund posted), the same dates Accounting posts the reversing VAT on.</para>
/// </summary>
public sealed class GetIrdSalesRegisterQueryHandler(SalesDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetIrdSalesRegisterQuery, IReadOnlyList<IrdSalesRegisterRowDto>>
{
    public async ValueTask<IReadOnlyList<IrdSalesRegisterRowDto>> Handle(
        GetIrdSalesRegisterQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        DateTime from = query.PeriodStartUtc;
        DateTime to = query.PeriodEndUtc;

        // Invoices issued in the period (completed, or cancelled since).
        var sales = await dbContext.Sales.AsNoTracking()
            .Include(s => s.Items)
            .Where(s => (s.Status == SaleStatus.Completed || s.Status == SaleStatus.Cancelled)
                && s.SaleDateUtc >= from
                && s.SaleDateUtc <= to
                && (!branchId.HasValue || s.BranchId == branchId.Value))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Cancellations recorded in the period (of invoices from this or an earlier period).
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

        if (sales.Count == 0 && cancelled.Count == 0 && returns.Count == 0 && refunds.Count == 0)
        {
            return [];
        }

        // The invoices the returns/refunds reverse (for their number, payment and IRD status).
        var reversedSaleIds = returns.Select(r => r.SaleId).Concat(refunds.Select(r => r.OriginalSaleId)).Distinct().ToList();
        var originals = await dbContext.Sales.AsNoTracking()
            .Where(s => reversedSaleIds.Contains(s.Id))
            .Select(s => new { s.Id, s.InvoiceNumber, s.IrdStatus, s.CustomerId })
            .ToDictionaryAsync(s => s.Id, cancellationToken)
            .ConfigureAwait(false);

        var customerIds = sales.Select(s => s.CustomerId)
            .Concat(cancelled.Select(s => s.CustomerId))
            .Concat(returns.Select(r => r.CustomerId ?? originals.GetValueOrDefault(r.SaleId)?.CustomerId))
            .Concat(refunds.Select(r => r.CustomerId ?? originals.GetValueOrDefault(r.OriginalSaleId)?.CustomerId))
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToList();
        var customers = await LoadCustomersAsync(customerIds, cancellationToken).ConfigureAwait(false);

        IrdSalesRegisterRowDto Row(
            Guid saleId, string? invoiceNumber, DateTime date, decimal total, decimal? vat, decimal discount, string payment,
            string irdStatus, Guid? customerId, decimal? taxable, decimal? exempt, string rowType, string? documentNumber,
            string? originalInvoiceNumber)
        {
            var customer = customerId.HasValue ? customers.GetValueOrDefault(customerId.Value) : null;
            return new IrdSalesRegisterRowDto(
                saleId, invoiceNumber, date, total, vat, discount, payment, irdStatus, customerId,
                customer?.Name ?? (customerId.HasValue ? "\u2014" : "Walk-in"),
                customer?.Phone, customer?.Email, taxable, exempt, rowType, documentNumber, originalInvoiceNumber);
        }

        var rows = new List<IrdSalesRegisterRowDto>();

        foreach (var s in sales)
        {
            var (taxable, exempt) = VatBreakdown(s.TotalAmount, s.VatAmount, s.TaxableAmount, s.ExemptAmount, s.VatRatePercent);
            rows.Add(Row(
                s.Id, s.InvoiceNumber, s.SaleDateUtc, s.TotalAmount, s.VatAmount, s.Items.Sum(i => i.DiscountAmount),
                s.PaymentMethod, s.IrdStatus.ToString(), s.CustomerId, taxable, exempt, IrdRegisterRowTypes.Sale, null, null));
        }

        foreach (var s in cancelled)
        {
            var (taxable, exempt) = VatBreakdown(s.TotalAmount, s.VatAmount, s.TaxableAmount, s.ExemptAmount, s.VatRatePercent);
            rows.Add(Row(
                s.Id, s.InvoiceNumber, s.CancelledAtUtc!.Value, -s.TotalAmount, -s.VatAmount, 0m,
                s.PaymentMethod, s.IrdStatus.ToString(), s.CustomerId, -taxable, -exempt, IrdRegisterRowTypes.Cancellation,
                s.InvoiceNumber, s.InvoiceNumber));
        }

        foreach (var r in returns)
        {
            var original = originals.GetValueOrDefault(r.SaleId);
            rows.Add(Row(
                r.SaleId, original?.InvoiceNumber, r.StockRestoredAtUtc!.Value, -r.TotalReturnAmount, -r.VatAmount, 0m,
                r.RefundMethod, original?.IrdStatus.ToString() ?? string.Empty, r.CustomerId ?? original?.CustomerId,
                -r.TaxableAmount, -r.ExemptAmount, IrdRegisterRowTypes.Return, r.CreditNoteNumber, original?.InvoiceNumber));
        }

        foreach (var r in refunds)
        {
            var original = originals.GetValueOrDefault(r.OriginalSaleId);
            rows.Add(Row(
                r.OriginalSaleId, original?.InvoiceNumber, r.AccountingPostedAtUtc!.Value, -(r.RefundAmount + r.TaxRefundAmount),
                -r.VatAmount, 0m, r.RefundMethod, original?.IrdStatus.ToString() ?? string.Empty,
                r.CustomerId ?? original?.CustomerId, -r.TaxableAmount, -r.ExemptAmount, IrdRegisterRowTypes.Refund,
                r.CreditNoteNumber, original?.InvoiceNumber));
        }

        return rows
            .OrderBy(r => r.SaleDateUtc)
            .ThenBy(r => r.RowType == IrdRegisterRowTypes.Sale ? 0 : 1)
            .ToList();
    }

    /// <summary>Nepal's standard VAT rate, used to back out the taxable value of sales recorded before the
    /// rate was stored on the sale.</summary>
    public const decimal DefaultVatRatePercent = 13m;

    /// <summary>
    /// The taxable (VAT-exclusive) and exempt values of a sale. Uses the breakdown stored at sale time when
    /// present; for older sales derives taxable = VAT ÷ rate and exempt = total − taxable − VAT (the
    /// remainder). Total − VAT is NOT the taxable value — it also contains the exempt lines.
    /// </summary>
    public static (decimal? Taxable, decimal? Exempt) VatBreakdown(
        decimal totalAmount, decimal? vatAmount, decimal? storedTaxable, decimal? storedExempt, decimal? vatRatePercent)
    {
        if (storedTaxable is { } taxable && storedExempt is { } exempt)
        {
            return (taxable, exempt);
        }

        if (vatAmount is not { } vat)
        {
            return (null, null);
        }

        decimal rate = vatRatePercent is > 0m ? vatRatePercent.Value : DefaultVatRatePercent;
        decimal derivedTaxable = vat == 0m ? 0m : Math.Round(vat * 100m / rate, 2, MidpointRounding.AwayFromZero);
        decimal derivedExempt = Math.Max(0m, totalAmount - derivedTaxable - vat);
        return (derivedTaxable, derivedExempt);
    }

    private async Task<Dictionary<Guid, CustomerDto>> LoadCustomersAsync(IReadOnlyList<Guid> customerIds, CancellationToken ct)
    {
        var result = new Dictionary<Guid, CustomerDto>();
        foreach (var id in customerIds)
        {
            try
            {
                var customer = await mediator.Send(new GetCustomerByIdQuery(id), ct).ConfigureAwait(false);
                result[id] = customer;
            }
            catch (NotFoundException)
            {
                // Customer since deleted/purged — leave unresolved rather than fail the whole report.
            }
        }

        return result;
    }
}
