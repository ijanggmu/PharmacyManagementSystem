using System.Net;
using System.Text.Json;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Ird.SendIrdInvoice;

/// <summary>
/// .NET port of the Next.js reference's <c>enqueueIrdInvoice</c> (lib/server/services/reports-
/// service.ts): assigns an invoice number the first time a sale is sent, builds the invoice payload
/// (mirroring the fields the reference sends: invoice number, sale date/total, customer, items), and
/// inserts a <see cref="Domain.IrdInvoiceQueueEntry"/> row for <c>Jobs.ProcessIrdInvoiceQueueJob</c> to drain.
/// Only a completed sale that is neither already reported nor already waiting in the queue can be sent: a
/// cancelled sale must not reach IRD as a valid invoice, and a second send would report it twice. The sale
/// row is locked first, so a double-clicked send waits and is then refused.
/// </summary>
public sealed class SendIrdInvoiceCommandHandler(SalesDbContext dbContext, IInvoiceNumberService invoiceNumbers)
    : ICommandHandler<SendIrdInvoiceCommand, SendIrdInvoiceResponseDto>
{
    public async ValueTask<SendIrdInvoiceResponseDto> Handle(SendIrdInvoiceCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Branch is needed (before the transaction — it's a cross-module read) only for a sale that
        // predates sequential numbering and has no number yet.
        var header = await dbContext.Sales
            .AsNoTracking()
            .Where(s => s.Id == command.SaleId)
            .Select(s => new { s.BranchId, s.InvoiceNumber })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.SaleId} was not found.");

        var invoiceContext = header.InvoiceNumber is null
            ? await invoiceNumbers.ResolveContextAsync(header.BranchId, cancellationToken).ConfigureAwait(false)
            : null;

        // The sale is loaded inside the transaction: on a retry SalesTransaction clears the change
        // tracker, so an entity loaded outside it would be detached and its number never saved.
        return await SalesTransaction.ExecuteAsync(
            dbContext,
            async ct =>
            {
                await SalesTransaction.LockSaleRowAsync(dbContext, command.SaleId, ct).ConfigureAwait(false);
                var sale = await dbContext.Sales
                    .Include(s => s.Items)
                    .FirstAsync(s => s.Id == command.SaleId, ct)
                    .ConfigureAwait(false);

                if (sale.Status != SaleStatus.Completed)
                {
                    throw new CustomException(
                        $"Only a completed sale can be sent to IRD; this sale is {sale.Status}.",
                        (IEnumerable<string>?)null, HttpStatusCode.Conflict);
                }

                if (sale.IsIrdLocked)
                {
                    throw new CustomException(
                        "This sale has already been reported to IRD.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
                }

                bool alreadyQueued = await dbContext.IrdInvoiceQueues.AsNoTracking()
                    .AnyAsync(q => q.SaleId == sale.Id
                        && (q.Status == IrdQueueStatus.Pending || q.Status == IrdQueueStatus.Processing), ct)
                    .ConfigureAwait(false);
                if (alreadyQueued)
                {
                    throw new CustomException(
                        "This sale is already waiting to be sent to IRD.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
                }

                // Older sales get the next number in their own fiscal year's sequence for their branch,
                // in the same transaction as the queue row so a failure can't burn a number.
                if (sale.InvoiceNumber is null && invoiceContext is not null)
                {
                    int fiscalYear = NepalFiscalYear.StartYearFor(sale.SaleDateUtc);
                    int sequence = await invoiceNumbers.ReserveNextAsync(sale.BranchId, fiscalYear, ct).ConfigureAwait(false);
                    sale.AssignInvoice(InvoiceNumberService.Format(invoiceContext, fiscalYear, sequence), fiscalYear);
                }

                string invoiceNumber = sale.InvoiceNumber!;
                var queueItem = IrdInvoiceQueueEntry.Enqueue(sale.Id, BuildPayloadJson(sale, invoiceNumber));
                dbContext.IrdInvoiceQueues.Add(queueItem);
                await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
                return new SendIrdInvoiceResponseDto(sale.Id, queueItem.Id, invoiceNumber);
            },
            cancellationToken).ConfigureAwait(false);
    }

    private static string BuildPayloadJson(Sale sale, string invoiceNumber)
    {
        var payload = new
        {
            invoiceNumber,
            saleDate = sale.SaleDateUtc,
            totalAmount = sale.TotalAmount,
            fiscalYear = sale.FiscalYear is { } fy ? NepalFiscalYear.Label(fy) : null,
            taxableAmount = sale.TaxableAmount,
            vatAmount = sale.VatAmount,
            exemptAmount = sale.ExemptAmount,
            customerId = sale.CustomerId,
            items = sale.Items.Select(i => new
            {
                medicineId = i.MedicineId,
                quantity = i.Quantity,
                unitPrice = i.UnitPrice,
                totalPrice = i.LineTotal,
            }).ToList(),
        };

        return JsonSerializer.Serialize(payload);
    }
}
