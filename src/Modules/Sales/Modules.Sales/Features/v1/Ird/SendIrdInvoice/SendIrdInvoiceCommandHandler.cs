using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using FSH.Modules.Sales.Services.Ird;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Ird.SendIrdInvoice;

/// <summary>
/// Manual send of a sale's bill to IRD (bills are normally queued automatically when a sale completes — see
/// <see cref="IrdDocumentEnqueuer"/>): assigns an invoice number to an older sale that has none, builds the CBMS bill
/// document (<see cref="CbmsPayloadBuilder.ForSale"/>), inserts a <see cref="Domain.IrdInvoiceQueueEntry"/> row and
/// triggers an immediate dispatch by <c>Jobs.ProcessIrdInvoiceQueueJob</c>.
///
/// Guards (409): only a completed sale is sent (a cancelled sale is not an invoice to report); a sale
/// already synced to IRD is never sent again; and while a queue item for the sale is still pending or in
/// flight, a second one is not added (a re-send is allowed once the previous attempt has failed for good).
/// The sale-row lock serializes concurrent sends of the same sale.
/// </summary>
public sealed class SendIrdInvoiceCommandHandler(
    SalesDbContext dbContext,
    IInvoiceNumberService invoiceNumbers,
    ICurrentBranch currentBranch,
    IMediator mediator,
    IrdDocumentEnqueuer documentQueue,
    ICurrentUser currentUser)
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
            .Select(s => new { s.BranchId, s.InvoiceNumber, s.CustomerId })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.SaleId} was not found.");
        await currentBranch.EnsureCanSeeBranchAsync(header.BranchId, $"Sale {command.SaleId} was not found.", cancellationToken)
            .ConfigureAwait(false);

        var invoiceContext = header.InvoiceNumber is null
            ? await invoiceNumbers.ResolveContextAsync(header.BranchId, cancellationToken).ConfigureAwait(false)
            : null;

        // Cross-module read, before the transaction opens.
        string? customerName = await CustomerNameAsync(header.CustomerId, cancellationToken).ConfigureAwait(false);

        // The sale is loaded inside the transaction: on a retry SalesTransaction clears the change
        // tracker, so an entity loaded outside it would be detached and its number never saved.
        var response = await SalesTransaction.ExecuteAsync(
            dbContext,
            async ct =>
            {
                await SalesTransaction.LockSaleRowAsync(dbContext, command.SaleId, ct).ConfigureAwait(false);

                var sale = await dbContext.Sales
                    .Include(s => s.Items)
                    .FirstAsync(s => s.Id == command.SaleId, ct)
                    .ConfigureAwait(false);

                await EnsureSendableAsync(sale, ct).ConfigureAwait(false);

                // Older sales get the next number in their own fiscal year's sequence for their branch,
                // in the same transaction as the queue row so a failure can't burn a number.
                if (sale.InvoiceNumber is null && invoiceContext is not null)
                {
                    int fiscalYear = NepalFiscalYear.StartYearFor(sale.SaleDateUtc);
                    int sequence = await invoiceNumbers.ReserveNextAsync(sale.BranchId, fiscalYear, ct).ConfigureAwait(false);
                    sale.AssignInvoice(InvoiceNumberService.Format(invoiceContext, fiscalYear, sequence), fiscalYear);
                }

                string invoiceNumber = sale.InvoiceNumber!;
                var document = CbmsPayloadBuilder.ForSale(sale, customerName);
                var queueItem = IrdInvoiceQueueEntry.Enqueue(
                    sale.Id, CbmsPayloadBuilder.Serialize(document), invoiceNumber, sale.CreatedAtUtc);
                dbContext.IrdInvoiceQueues.Add(queueItem);
                await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
                return new SendIrdInvoiceResponseDto(sale.Id, queueItem.Id, invoiceNumber);
            },
            cancellationToken).ConfigureAwait(false);

        documentQueue.TriggerDispatch(currentUser.GetTenant());
        return response;
    }

    private async Task<string?> CustomerNameAsync(Guid? customerId, CancellationToken cancellationToken)
    {
        if (customerId is not { } id)
        {
            return null;
        }

        var rows = await mediator.Send(new LookupCustomersQuery([id], null, 1), cancellationToken).ConfigureAwait(false);
        return rows?.FirstOrDefault(c => c.Id == id)?.Name;
    }

    private async Task EnsureSendableAsync(Sale sale, CancellationToken cancellationToken)
    {
        if (sale.Status != SaleStatus.Completed)
        {
            throw new CustomException(
                $"Only a completed sale can be sent to IRD (this sale is {sale.Status}).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (sale.IsIrdLocked)
        {
            throw new CustomException(
                $"Sale {sale.InvoiceNumber ?? sale.Id.ToString()} is already synced to IRD.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        bool inFlight = await dbContext.IrdInvoiceQueues
            .AnyAsync(q => q.SaleId == sale.Id && q.DocumentType == IrdDocumentType.Bill
                && (q.Status == IrdQueueStatus.Pending || q.Status == IrdQueueStatus.Processing), cancellationToken)
            .ConfigureAwait(false);
        if (inFlight)
        {
            throw new CustomException(
                "This sale is already queued for IRD and will be sent shortly.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
