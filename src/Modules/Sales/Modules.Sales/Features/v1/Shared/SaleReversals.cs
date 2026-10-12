using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Shared;

/// <summary>
/// Rules shared by returns and refunds of a sale — both give back part of the SAME sale lines, so they
/// are checked together:
/// <list type="bullet">
/// <item>only a completed sale can be returned/refunded (a cancelled sale has already been reversed in full);</item>
/// <item>one combined cap per sale line: units returned + units refunded (non-rejected) never exceed the
/// units sold;</item>
/// <item>each portion is valued at the line's after-discount total pro rata (<see cref="SaleItem.ReversalAmount"/>);</item>
/// <item>on completion the money is settled (<see cref="RefundMethods.Settle"/>) against what earlier
/// returns/refunds of the sale already credited to the customer's account, and the completion event is
/// published once.</item>
/// </list>
/// Every caller holds the sale row lock (<see cref="SalesTransaction.LockSaleRowAsync"/>) while it uses these.
/// </summary>
/// <summary>
/// Cross-module facts a return/refund needs, read BEFORE its transaction opens (other modules' queries run on
/// the shared connection): the branch's credit-note numbering context, the customer's current receivable (caps
/// the on-account portion, see <see cref="RefundMethods.Settle"/>) and the tenant's VAT rate (fallback for
/// sales recorded before the VAT breakdown was stored).
/// </summary>
internal sealed record ReversalContext(InvoiceNumberContext? NumberContext, decimal? CustomerOpenBalance, decimal TenantVatRatePercent)
{
    /// <summary>The numbering context; only resolved when the caller is about to complete the document.</summary>
    public InvoiceNumberContext RequireNumberContext() =>
        NumberContext ?? throw new InvalidOperationException("The credit-note numbering context was not resolved for a completion.");
}

internal static class SaleReversals
{
    public const string ReturnSource = "Sales";

    /// <summary>Reads the <see cref="ReversalContext"/> for a sale (before the transaction opens). The
    /// credit-note numbering context (branch code + prefix) is only resolved when <paramref name="completing"/>.</summary>
    public static async Task<ReversalContext> PrepareAsync(
        IMediator mediator, IInvoiceNumberService invoiceNumbers, Guid branchId, Guid? customerId, bool completing,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(mediator);
        ArgumentNullException.ThrowIfNull(invoiceNumbers);

        var numberContext = completing
            ? await invoiceNumbers.ResolveContextAsync(branchId, cancellationToken).ConfigureAwait(false)
            : null;
        var settings = await mediator.Send(new GetPharmacySettingsQuery(), cancellationToken).ConfigureAwait(false);
        decimal? openBalance = await CustomerOpenBalanceAsync(mediator, customerId, cancellationToken).ConfigureAwait(false);
        return new ReversalContext(numberContext, openBalance, settings.VatRatePercent);
    }

    /// <summary>The customer's current receivable, or null when there is no customer or it can't be read
    /// (a trashed customer); then only the sale's own balance caps the on-account portion.</summary>
    public static async Task<decimal?> CustomerOpenBalanceAsync(IMediator mediator, Guid? customerId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(mediator);
        if (customerId is not { } id)
        {
            return null;
        }

        try
        {
            var customer = await mediator.Send(new GetCustomerByIdQuery(id), cancellationToken).ConfigureAwait(false);
            return customer?.CurrentBalance;
        }
        catch (NotFoundException)
        {
            return null;
        }
    }

    /// <summary>
    /// 409 when the caller is working at a different branch than the one the sale was made at. A return/refund is
    /// recorded against the SALE's branch (its stock, drawer and credit-note series), so it must be processed
    /// there: the user switches to the sale's branch first. No branch resolved (tenant without branches): allowed.
    /// </summary>
    public static async Task EnsureAtSaleBranchAsync(ICurrentBranch currentBranch, Guid saleBranchId, string what, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(currentBranch);
        Guid? working = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        if (working is { } branchId && branchId != saleBranchId)
        {
            throw new CustomException(
                $"This sale was made at another branch. Switch to that branch to record the {what}: its stock, cash " +
                "drawer and credit notes belong to the branch that made the sale.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }

    /// <summary>409 unless the sale is completed.</summary>
    public static void EnsureReversible(Sale sale, string what)
    {
        ArgumentNullException.ThrowIfNull(sale);
        if (sale.Status == SaleStatus.Cancelled)
        {
            throw new CustomException(
                $"This sale was cancelled — it has already been reversed in full, so no {what} can be recorded against it.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (sale.Status != SaleStatus.Completed)
        {
            throw new CustomException(
                $"Only a completed sale can have a {what} (current status: {sale.Status}).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }

    /// <summary>Units and money already given back per sale line, across non-rejected returns AND refunds
    /// (soft-deleted ones are hidden by the query filter). <paramref name="excludeReturnId"/>/
    /// <paramref name="excludeRefundId"/> leave out the document being re-checked.</summary>
    public static async Task<Dictionary<Guid, (decimal Quantity, decimal Amount)>> LoadLineConsumptionAsync(
        SalesDbContext dbContext, Guid saleId, CancellationToken cancellationToken,
        Guid? excludeReturnId = null, Guid? excludeRefundId = null)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var returned = await (
            from ri in dbContext.SaleReturnItems
            join sr in dbContext.SaleReturns on ri.SaleReturnId equals sr.Id
            where sr.SaleId == saleId && sr.Status != ReturnStatus.Rejected && sr.Id != excludeReturnId
            select new { ri.SaleItemId, Quantity = ri.QuantityReturned, Amount = ri.LineAmount ?? ri.QuantityReturned * ri.UnitPrice })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var refunded = await (
            from ri in dbContext.SaleRefundItems
            join sr in dbContext.SaleRefunds on ri.SaleRefundId equals sr.Id
            where sr.OriginalSaleId == saleId && sr.Status != RefundStatus.Rejected && sr.Id != excludeRefundId
            select new { ri.SaleItemId, Quantity = ri.QuantityRefunded, Amount = ri.LineAmount ?? ri.QuantityRefunded * ri.UnitPrice })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return returned.Concat(refunded)
            .GroupBy(x => x.SaleItemId)
            .ToDictionary(g => g.Key, g => (g.Sum(x => x.Quantity), g.Sum(x => x.Amount)));
    }

    /// <summary>
    /// Checks the combined cap for <paramref name="quantity"/> more units of <paramref name="saleItem"/>,
    /// returns the money value of those units, and records them in <paramref name="consumption"/> (so a
    /// second line on the same request for the same sale item is checked against the first).
    /// </summary>
    public static decimal TakeLine(
        SaleItem saleItem, decimal quantity, Dictionary<Guid, (decimal Quantity, decimal Amount)> consumption, string what)
    {
        ArgumentNullException.ThrowIfNull(saleItem);
        ArgumentNullException.ThrowIfNull(consumption);

        var (alreadyQuantity, alreadyAmount) = consumption.GetValueOrDefault(saleItem.Id);
        if (alreadyQuantity + quantity > saleItem.Quantity)
        {
            decimal left = Math.Max(0m, saleItem.Quantity - alreadyQuantity);
            throw new CustomException(
                $"Only {left} more can be {what} on that line — {alreadyQuantity} of the {saleItem.Quantity} sold " +
                "have already been returned or refunded.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        decimal amount = saleItem.ReversalAmount(quantity, alreadyQuantity, alreadyAmount);
        consumption[saleItem.Id] = (alreadyQuantity + quantity, alreadyAmount + amount);
        return amount;
    }

    /// <summary>What earlier completed returns/refunds of the sale already credited to the customer's account.</summary>
    public static async Task<decimal> OnAccountAlreadyCreditedAsync(
        SalesDbContext dbContext, Guid saleId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        decimal returns = await dbContext.SaleReturns
            .Where(r => r.SaleId == saleId && r.SettlementOnAccountAmount != null)
            .SumAsync(r => r.SettlementOnAccountAmount ?? 0m, cancellationToken)
            .ConfigureAwait(false);
        decimal refunds = await dbContext.SaleRefunds
            .Where(r => r.OriginalSaleId == saleId && r.SettlementOnAccountAmount != null)
            .SumAsync(r => r.SettlementOnAccountAmount ?? 0m, cancellationToken)
            .ConfigureAwait(false);
        return returns + refunds;
    }

    /// <summary>Items value of every completed return and refund of the sale (what has actually been
    /// given back so far).</summary>
    public static async Task<decimal> ReversedToDateAsync(SalesDbContext dbContext, Guid saleId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        decimal returned = await (
            from ri in dbContext.SaleReturnItems
            join sr in dbContext.SaleReturns on ri.SaleReturnId equals sr.Id
            where sr.SaleId == saleId && sr.StockRestoredAtUtc != null
            select ri.LineAmount ?? ri.QuantityReturned * ri.UnitPrice)
            .SumAsync(cancellationToken)
            .ConfigureAwait(false);
        decimal refunded = await (
            from ri in dbContext.SaleRefundItems
            join sr in dbContext.SaleRefunds on ri.SaleRefundId equals sr.Id
            where sr.OriginalSaleId == saleId && sr.AccountingPostedAtUtc != null
            select ri.LineAmount ?? ri.QuantityRefunded * ri.UnitPrice)
            .SumAsync(cancellationToken)
            .ConfigureAwait(false);
        return returned + refunded;
    }

    /// <summary>
    /// Completes a return exactly once: settles its money, marks stock restored, saves, and publishes
    /// <see cref="ReturnCompletedIntegrationEvent"/> (Inventory restocks; Accounting reverses revenue, VAT and
    /// COGS; Customers credits AR / reverses loyalty). A no-op when it was already completed.
    /// </summary>
    public static async Task CompleteReturnAsync(
        SalesDbContext dbContext, IOutboxWriter outbox, IInvoiceNumberService invoiceNumbers, ReversalContext context,
        string? tenantId, Sale sale, SaleReturn saleReturn, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(outbox);
        ArgumentNullException.ThrowIfNull(invoiceNumbers);
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(sale);
        ArgumentNullException.ThrowIfNull(saleReturn);

        if (saleReturn.StockRestoredAtUtc is not null)
        {
            return;
        }

        decimal credited = await OnAccountAlreadyCreditedAsync(dbContext, sale.Id, cancellationToken).ConfigureAwait(false);
        var settlement = RefundMethods.Settle(sale, saleReturn.TotalReturnAmount, saleReturn.RefundMethod, credited, context.CustomerOpenBalance);
        saleReturn.RecordSettlement(settlement);

        // IRD credit note, numbered only now that the return is completed (shared CN series with refunds,
        // reserved on this transaction; a rollback releases it).
        if (saleReturn.CreditNoteNumber is null)
        {
            int fiscalYear = NepalFiscalYear.StartYearFor(DateTime.UtcNow);
            int sequence = await invoiceNumbers.ReserveNextCreditNoteAsync(sale.BranchId, fiscalYear, cancellationToken).ConfigureAwait(false);
            saleReturn.AssignCreditNote(InvoiceNumberService.FormatCreditNote(context.RequireNumberContext(), fiscalYear, sequence), fiscalYear);
        }

        saleReturn.MarkStockRestoredIfNeeded();
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        decimal reversedToDate = await ReversedToDateAsync(dbContext, sale.Id, cancellationToken).ConfigureAwait(false);

        var lines = saleReturn.Items
            .Select(i => new ReturnCompletedLine(
                i.MedicineId, i.QuantityReturned, i.UnitCostPrice, Restock: i.PackagingCondition == PackagingCondition.Sealed))
            .ToList();

        string correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
        await outbox.AddAsync(new ReturnCompletedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: tenantId,
            CorrelationId: correlationId,
            Source: ReturnSource,
            ReturnId: saleReturn.Id,
            SaleId: saleReturn.SaleId,
            BranchId: saleReturn.BranchId,
            TotalReturnAmount: saleReturn.TotalReturnAmount,
            Lines: lines,
            CustomerId: sale.CustomerId,
            VatAmount: saleReturn.VatAmount ?? 0m,
            CashAmount: settlement.Cash,
            BankAmount: settlement.Bank,
            OnAccountAmount: settlement.OnAccount,
            SaleTotalAmount: Money.Round(sale.TotalAmount),
            RefundMethod: saleReturn.RefundMethod,
            ReversedToDateAmount: reversedToDate,
            CreditNoteNumber: saleReturn.CreditNoteNumber),
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Refund counterpart of <see cref="CompleteReturnAsync"/> (no restock).</summary>
    public static async Task CompleteRefundAsync(
        SalesDbContext dbContext, IOutboxWriter outbox, IInvoiceNumberService invoiceNumbers, ReversalContext context,
        string? tenantId, Sale sale, SaleRefund refund, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(outbox);
        ArgumentNullException.ThrowIfNull(invoiceNumbers);
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(sale);
        ArgumentNullException.ThrowIfNull(refund);

        if (refund.AccountingPostedAtUtc is not null)
        {
            return;
        }

        decimal credited = await OnAccountAlreadyCreditedAsync(dbContext, sale.Id, cancellationToken).ConfigureAwait(false);
        var settlement = RefundMethods.Settle(sale, refund.NetRefundAmount, refund.RefundMethod, credited, context.CustomerOpenBalance);
        refund.RecordSettlement(settlement);

        // IRD credit note, numbered only at completion: a pending refund later rejected or deleted never burns
        // a number. Refunds numbered at creation by an earlier version keep their number.
        if (refund.CreditNoteNumber is null)
        {
            int fiscalYear = NepalFiscalYear.StartYearFor(DateTime.UtcNow);
            int sequence = await invoiceNumbers.ReserveNextCreditNoteAsync(sale.BranchId, fiscalYear, cancellationToken).ConfigureAwait(false);
            refund.AssignCreditNote(InvoiceNumberService.FormatCreditNote(context.RequireNumberContext(), fiscalYear, sequence), fiscalYear);
        }

        refund.MarkAccountingPostedIfNeeded();
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        decimal reversedToDate = await ReversedToDateAsync(dbContext, sale.Id, cancellationToken).ConfigureAwait(false);

        string correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
        await outbox.AddAsync(new RefundCompletedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: tenantId,
            CorrelationId: correlationId,
            Source: ReturnSource,
            RefundId: refund.Id,
            OriginalSaleId: refund.OriginalSaleId,
            BranchId: refund.BranchId,
            NetRefundAmount: refund.NetRefundAmount,
            CustomerId: sale.CustomerId,
            GrossRefundAmount: refund.RefundAmount + refund.TaxRefundAmount,
            VatAmount: refund.VatAmount ?? 0m,
            ProcessingFeeRetained: refund.ProcessingFeeRetained,
            CashAmount: settlement.Cash,
            BankAmount: settlement.Bank,
            OnAccountAmount: settlement.OnAccount,
            SaleTotalAmount: Money.Round(sale.TotalAmount),
            ItemsAmount: refund.RefundAmount,
            RefundMethod: refund.RefundMethod,
            CreditNoteNumber: refund.CreditNoteNumber,
            ReversedToDateAmount: reversedToDate),
            cancellationToken).ConfigureAwait(false);
    }
}
