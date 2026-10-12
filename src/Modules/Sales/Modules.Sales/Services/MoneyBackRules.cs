using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Services;

/// <summary>
/// The limits and events shared by returns and refunds. A return (goods back) pays out through its
/// linked refund, and a refund on its own pays money back without goods, so the two are checked
/// against ONE budget per sale: the units on a sale line can be given back only once, by either path,
/// and the money paid back can never pass what the sale took. Callers hold the sale-row lock
/// (<see cref="SalesTransaction.LockSaleRowAsync"/>) before reading these sums.
/// </summary>
internal static class MoneyBackRules
{
    /// <summary>
    /// Units of <paramref name="saleItem"/> already given back: returned on any non-rejected return, plus
    /// refunded on any non-rejected refund that is NOT a return's payout (that refund's units are the
    /// return's units, already counted). Throws 409 if <paramref name="quantity"/> more would pass the
    /// quantity sold.
    /// </summary>
    public static async Task EnsureQuantityAvailableAsync(
        SalesDbContext dbContext, SaleItem saleItem, decimal quantity, CancellationToken cancellationToken)
    {
        decimal returned = await (
            from ri in dbContext.SaleReturnItems
            join sr in dbContext.SaleReturns on ri.SaleReturnId equals sr.Id
            where ri.SaleItemId == saleItem.Id && sr.Status != ReturnStatus.Rejected
            select ri.QuantityReturned)
            .SumAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal refundedWithoutReturn = await (
            from ri in dbContext.SaleRefundItems
            join sr in dbContext.SaleRefunds on ri.SaleRefundId equals sr.Id
            where ri.SaleItemId == saleItem.Id && sr.Status != RefundStatus.Rejected && sr.ReturnId == null
            select ri.QuantityRefunded)
            .SumAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal alreadyBack = returned + refundedWithoutReturn;
        if (alreadyBack + quantity > saleItem.Quantity)
        {
            throw new CustomException(
                $"Only {saleItem.Quantity - alreadyBack} of the {saleItem.Quantity} units sold on this line can still be returned or refunded " +
                $"({returned} already returned, {refundedWithoutReturn} already refunded).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }

    /// <summary>
    /// Money already paid back on <paramref name="sale"/>: every non-rejected refund's net amount, plus
    /// any non-rejected return made before returns paid out through a refund. Throws 409 if
    /// <paramref name="amount"/> more would pass the sale total.
    /// </summary>
    public static async Task EnsureAmountAvailableAsync(
        SalesDbContext dbContext, Sale sale, decimal amount, CancellationToken cancellationToken)
    {
        // NetRefundAmount/TotalReturnAmount are computed over the items, so the rows are materialized.
        var refunds = await dbContext.SaleRefunds
            .AsNoTracking()
            .Include(r => r.Items)
            .Where(r => r.OriginalSaleId == sale.Id && r.Status != RefundStatus.Rejected)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var paidOutReturnIds = refunds.Where(r => r.ReturnId is not null).Select(r => r.ReturnId!.Value).ToHashSet();
        var unpaidReturns = await dbContext.SaleReturns
            .AsNoTracking()
            .Include(r => r.Items)
            .Where(r => r.SaleId == sale.Id && r.Status != ReturnStatus.Rejected)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal alreadyBack = refunds.Sum(r => r.NetRefundAmount)
            + unpaidReturns.Where(r => !paidOutReturnIds.Contains(r.Id)).Sum(r => r.TotalReturnAmount);

        if (alreadyBack + amount > sale.TotalAmount)
        {
            throw new CustomException(
                $"Paying back {amount} would exceed what is left of the sale ({alreadyBack} already paid back of {sale.TotalAmount}).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }

    /// <summary>
    /// The refund that pays out <paramref name="saleReturn"/>: one line per returned line at the same
    /// price, the same status, the VAT breakdown of the original sale, and its own credit-note number.
    /// </summary>
    public static async Task<SaleRefund> CreateReturnPayoutAsync(
        SalesDbContext dbContext, SaleReturn saleReturn, Sale sale, string refundMethod, IInvoiceNumberService invoiceNumbers,
        InvoiceNumberContext numberContext, CancellationToken cancellationToken)
    {
        var refund = SaleRefund.Create(
            saleReturn.BranchId, sale.Id, sale.CustomerId ?? saleReturn.CustomerId, saleReturn.ReturnDateUtc, ToRefundStatus(saleReturn.Status),
            saleReturn.ReturnReason, refundType: "return", refundMethod, processingFee: 0m, saleReturn.Notes, returnId: saleReturn.Id);

        foreach (var item in saleReturn.Items)
        {
            refund.AddItem(item.SaleItemId, item.MedicineId, item.QuantityReturned, item.UnitPrice);
        }

        await AssignCreditNoteAsync(refund, sale, invoiceNumbers, numberContext, cancellationToken).ConfigureAwait(false);
        await ApplyAccountCreditAsync(dbContext, refund, sale, cancellationToken).ConfigureAwait(false);
        ApplyPayoutSplit(refund, sale);
        return refund;
    }

    /// <summary>
    /// Decides how much of <paramref name="refund"/> goes onto the customer's account rather than out of the
    /// till. Money owed on a credit sale is cleared first: a customer who has not paid is not handed cash.
    /// A store-credit refund goes wholly onto the account. A walk-in sale (no customer) is always paid out.
    /// </summary>
    public static async Task ApplyAccountCreditAsync(
        SalesDbContext dbContext, SaleRefund refund, Sale sale, CancellationToken cancellationToken)
    {
        if (sale.CustomerId is null)
        {
            return;
        }

        if (string.Equals(refund.RefundMethod, StoreCreditMethod, StringComparison.OrdinalIgnoreCase))
        {
            refund.SetAccountCredit(refund.NetRefundAmount);
            return;
        }

        if (sale.BalanceDue <= 0)
        {
            return;
        }

        decimal alreadyCredited = await dbContext.SaleRefunds
            .Where(r => r.OriginalSaleId == sale.Id && r.Status != RefundStatus.Rejected && r.Id != refund.Id)
            .SumAsync(r => r.AccountCreditAmount, cancellationToken)
            .ConfigureAwait(false);
        decimal stillOwedOnSale = Math.Max(0m, sale.BalanceDue - alreadyCredited);
        refund.SetAccountCredit(Math.Min(refund.NetRefundAmount, stillOwedOnSale));
    }

    /// <summary>
    /// Splits what the refund pays out between cash and bank, following how the sale was paid when it goes
    /// back to the original payment: the cash legs' share of what was received (credit legs were never
    /// received). <paramref name="sale"/> must be loaded with its payments.
    /// </summary>
    public static void ApplyPayoutSplit(SaleRefund refund, Sale sale)
    {
        var received = sale.Payments.Where(p => !string.Equals(p.Method, SalePaymentMethods.Credit, StringComparison.OrdinalIgnoreCase)).ToList();
        decimal total = received.Sum(p => p.Amount);
        decimal cash = received.Where(p => string.Equals(p.Method, SalePaymentMethods.Cash, StringComparison.OrdinalIgnoreCase)).Sum(p => p.Amount);
        refund.SplitPayout(total > 0 ? cash / total : 1m);
    }

    public const string StoreCreditMethod = "store_credit";

    /// <summary>IRD credit note: sequential per branch and Nepali fiscal year (its own CN series), reserved
    /// on the caller's transaction so a rollback releases the number. The VAT split of the refunded lines
    /// comes from the original sale's rate and each line's VAT status.</summary>
    public static async Task AssignCreditNoteAsync(
        SaleRefund refund, Sale sale, IInvoiceNumberService invoiceNumbers, InvoiceNumberContext numberContext,
        CancellationToken cancellationToken)
    {
        refund.ApplyVatBreakdown(sale.VatRatePercent, sale.Items.ToDictionary(i => i.Id, i => i.IsTaxable));
        int fiscalYear = NepalFiscalYear.StartYearFor(refund.RefundDateUtc);
        int sequence = await invoiceNumbers.ReserveNextCreditNoteAsync(refund.BranchId, fiscalYear, cancellationToken).ConfigureAwait(false);
        refund.AssignCreditNote(InvoiceNumberService.FormatCreditNote(numberContext, fiscalYear, sequence), fiscalYear);
    }

    public static RefundStatus ToRefundStatus(ReturnStatus status) => status switch
    {
        ReturnStatus.Pending => RefundStatus.Pending,
        ReturnStatus.Approved => RefundStatus.Approved,
        ReturnStatus.Rejected => RefundStatus.Rejected,
        ReturnStatus.Completed => RefundStatus.Completed,
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null),
    };

    public static Task PublishReturnCompletedAsync(
        IOutboxWriter outbox, ICurrentUser currentUser, SaleReturn saleReturn, bool moneyRefundedSeparately,
        CancellationToken cancellationToken)
    {
        var lines = saleReturn.Items
            .Select(i => new ReturnCompletedLine(i.MedicineId, i.QuantityReturned, i.UnitCostPrice, i.BatchId, i.Restock))
            .ToList();

        return outbox.AddAsync(new ReturnCompletedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
            Source: "Sales",
            ReturnId: saleReturn.Id,
            SaleId: saleReturn.SaleId,
            BranchId: saleReturn.BranchId,
            TotalReturnAmount: saleReturn.TotalReturnAmount,
            Lines: lines,
            MoneyRefundedSeparately: moneyRefundedSeparately),
            cancellationToken);
    }

    public static Task PublishRefundCompletedAsync(
        IOutboxWriter outbox, ICurrentUser currentUser, SaleRefund refund, CancellationToken cancellationToken) =>
        outbox.AddAsync(new RefundCompletedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
            Source: "Sales",
            RefundId: refund.Id,
            OriginalSaleId: refund.OriginalSaleId,
            BranchId: refund.BranchId,
            NetRefundAmount: refund.NetRefundAmount,
            VatAmount: refund.VatAmount ?? 0m,
            AccountCreditAmount: refund.AccountCreditAmount,
            CustomerId: refund.CustomerId,
            CashPaidOut: refund.CashPaidOut,
            BankPaidOut: refund.BankPaidOut),
            cancellationToken);
}
