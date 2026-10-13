using FSH.Framework.Jobs.Services;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Jobs;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Sales.Services.Ird;

/// <summary>
/// Queues the documents IRD's CBMS must receive — the bill of every completed sale and a bill-return for every credit
/// note (completed return, completed refund, cancellation) — when the tenant has IRD e-billing enabled, then asks
/// Hangfire to dispatch the tenant's queue right away so the document can reach CBMS in real time. Driven by Sales'
/// own integration events (outbox), so a queue row is never written for a sale that rolled back. Idempotent: a
/// document already queued is not queued again.
/// </summary>
public sealed partial class IrdDocumentEnqueuer(
    SalesDbContext dbContext,
    IMediator mediator,
    IJobService jobService,
    ILogger<IrdDocumentEnqueuer> logger)
{
    public async Task<bool> EnqueueBillAsync(Guid saleId, string? tenantId, CancellationToken cancellationToken)
    {
        if (!await IsEnabledAsync(cancellationToken).ConfigureAwait(false)
            || await IsQueuedAsync(IrdDocumentType.Bill, saleId, cancellationToken).ConfigureAwait(false))
        {
            return false;
        }

        var sale = await dbContext.Sales.Include(s => s.Items)
            .FirstOrDefaultAsync(s => s.Id == saleId, cancellationToken)
            .ConfigureAwait(false);
        if (sale?.InvoiceNumber is null || sale.Status == SaleStatus.Building || sale.IsIrdLocked)
        {
            return false;
        }

        string? customerName = await CustomerNameAsync(sale.CustomerId, cancellationToken).ConfigureAwait(false);
        var document = CbmsPayloadBuilder.ForSale(sale, customerName);
        dbContext.IrdInvoiceQueues.Add(IrdInvoiceQueueEntry.Enqueue(
            sale.Id, CbmsPayloadBuilder.Serialize(document), sale.InvoiceNumber, sale.CreatedAtUtc == default ? sale.SaleDateUtc : sale.CreatedAtUtc));
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        TriggerDispatch(tenantId);
        return true;
    }

    public async Task<bool> EnqueueReturnAsync(Guid returnId, string? tenantId, CancellationToken cancellationToken)
    {
        if (!await IsEnabledAsync(cancellationToken).ConfigureAwait(false)
            || await IsQueuedAsync(IrdDocumentType.Return, returnId, cancellationToken).ConfigureAwait(false))
        {
            return false;
        }

        var saleReturn = await dbContext.SaleReturns.Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == returnId, cancellationToken)
            .ConfigureAwait(false);
        if (saleReturn?.CreditNoteNumber is null || saleReturn.StockRestoredAtUtc is null)
        {
            return false;
        }

        var sale = await LoadSaleAsync(saleReturn.SaleId, cancellationToken).ConfigureAwait(false);
        if (sale?.InvoiceNumber is null)
        {
            return false;
        }

        DateTime issued = saleReturn.StockRestoredAtUtc.Value;
        return await AddReturnAsync(sale, returnId, tenantId, new CbmsReturnInput(
            sale.InvoiceNumber, saleReturn.CreditNoteNumber, issued,
            saleReturn.FiscalYear ?? NepalFiscalYear.StartYearFor(issued), saleReturn.ReturnReason,
            saleReturn.TotalReturnAmount, saleReturn.TaxableAmount, saleReturn.VatAmount, saleReturn.ExemptAmount,
            saleReturn.VatRatePercent ?? sale.VatRatePercent, null, sale.BuyerPan), cancellationToken).ConfigureAwait(false);
    }

    public async Task<bool> EnqueueRefundAsync(Guid refundId, string? tenantId, CancellationToken cancellationToken)
    {
        if (!await IsEnabledAsync(cancellationToken).ConfigureAwait(false)
            || await IsQueuedAsync(IrdDocumentType.Return, refundId, cancellationToken).ConfigureAwait(false))
        {
            return false;
        }

        var refund = await dbContext.SaleRefunds.Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == refundId, cancellationToken)
            .ConfigureAwait(false);
        if (refund?.CreditNoteNumber is null || refund.AccountingPostedAtUtc is null)
        {
            return false;
        }

        var sale = await LoadSaleAsync(refund.OriginalSaleId, cancellationToken).ConfigureAwait(false);
        if (sale?.InvoiceNumber is null)
        {
            return false;
        }

        DateTime issued = refund.AccountingPostedAtUtc.Value;
        return await AddReturnAsync(sale, refundId, tenantId, new CbmsReturnInput(
            sale.InvoiceNumber, refund.CreditNoteNumber, issued,
            refund.FiscalYear ?? NepalFiscalYear.StartYearFor(issued), refund.RefundReason,
            refund.RefundAmount + refund.TaxRefundAmount, refund.TaxableAmount, refund.VatAmount, refund.ExemptAmount,
            refund.VatRatePercent ?? sale.VatRatePercent, null, sale.BuyerPan), cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// A cancellation voids the whole bill. CBMS has no "cancel" call, so it is reported as a bill-return of the full
    /// amount. The cancellation has no credit-note number of its own: the voided invoice's number stands in for it
    /// (the same number the sales register shows on the cancellation row).
    /// </summary>
    public async Task<bool> EnqueueCancellationAsync(Guid saleId, string? tenantId, CancellationToken cancellationToken)
    {
        if (!await IsEnabledAsync(cancellationToken).ConfigureAwait(false)
            || await IsQueuedAsync(IrdDocumentType.Return, saleId, cancellationToken).ConfigureAwait(false))
        {
            return false;
        }

        var sale = await LoadSaleAsync(saleId, cancellationToken).ConfigureAwait(false);
        if (sale?.InvoiceNumber is null || sale.Status != SaleStatus.Cancelled || sale.CancelledAtUtc is null)
        {
            return false;
        }

        DateTime issued = sale.CancelledAtUtc.Value;
        return await AddReturnAsync(sale, saleId, tenantId, new CbmsReturnInput(
            sale.InvoiceNumber, sale.InvoiceNumber, issued, NepalFiscalYear.StartYearFor(issued),
            sale.CancelReason ?? "Bill cancelled", sale.TotalAmount, sale.TaxableAmount, sale.VatAmount, sale.ExemptAmount,
            sale.VatRatePercent, null, sale.BuyerPan), cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Asks Hangfire to drain <paramref name="tenantId"/>'s queue now. Best effort: if the job can't be
    /// enqueued the recurring run picks the document up within minutes (it is then no longer realtime).</summary>
    public void TriggerDispatch(string? tenantId)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            return;
        }

        try
        {
            jobService.Enqueue<ProcessIrdInvoiceQueueJob>(j => j.RunForTenantAsync(tenantId, CancellationToken.None));
        }
        catch (Exception ex)
        {
            LogTriggerFailed(logger, ex, tenantId);
        }
    }

    private async Task<bool> AddReturnAsync(Sale sale, Guid documentId, string? tenantId, CbmsReturnInput input, CancellationToken cancellationToken)
    {
        string buyerName = sale.BuyerName
            ?? await CustomerNameAsync(sale.CustomerId, cancellationToken).ConfigureAwait(false)
            ?? string.Empty;
        var document = CbmsPayloadBuilder.ForReturn(input with { BuyerName = buyerName });
        dbContext.IrdInvoiceQueues.Add(IrdInvoiceQueueEntry.EnqueueDocument(
            sale.Id, IrdDocumentType.Return, documentId, input.CreditNoteNumber, input.CreditNoteDateUtc,
            CbmsPayloadBuilder.Serialize(document)));
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        TriggerDispatch(tenantId);
        return true;
    }

    private Task<Sale?> LoadSaleAsync(Guid saleId, CancellationToken cancellationToken) =>
        dbContext.Sales.AsNoTracking().Include(s => s.Items).FirstOrDefaultAsync(s => s.Id == saleId, cancellationToken);

    private async Task<bool> IsEnabledAsync(CancellationToken cancellationToken) =>
        await dbContext.IrdSettings.AsNoTracking()
            .AnyAsync(s => s.Enabled, cancellationToken)
            .ConfigureAwait(false);

    private Task<bool> IsQueuedAsync(IrdDocumentType type, Guid documentId, CancellationToken cancellationToken) =>
        dbContext.IrdInvoiceQueues.AnyAsync(
            q => q.DocumentType == type && q.DocumentId == documentId,
            cancellationToken);

    private async Task<string?> CustomerNameAsync(Guid? customerId, CancellationToken cancellationToken)
    {
        if (customerId is not { } id)
        {
            return null;
        }

        var rows = await mediator.Send(new LookupCustomersQuery([id], null, 1), cancellationToken).ConfigureAwait(false);
        return rows?.FirstOrDefault(c => c.Id == id)?.Name;
    }

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "Could not trigger immediate IRD dispatch for tenant {TenantId}; the recurring job will send it")]
    private static partial void LogTriggerFailed(ILogger logger, Exception exception, string tenantId);
}
