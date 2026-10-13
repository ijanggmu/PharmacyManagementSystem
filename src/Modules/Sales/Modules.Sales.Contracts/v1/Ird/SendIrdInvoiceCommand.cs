using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Ird;

/// <summary>
/// Explicitly enqueues a completed sale's invoice for IRD (Nepal Inland Revenue Department) e-invoice
/// submission. .NET port of the Next.js reference's POST <c>/api/ird</c> route
/// (<c>enqueueIrdInvoice</c> in lib/server/services/reports-service.ts): assigns an invoice number if
/// the sale doesn't already have one, builds the invoice payload, and inserts an
/// <c>IrdInvoiceQueueEntry</c> row with <c>Pending</c> status for <c>ProcessIrdInvoiceQueueJob</c> to drain.
///
/// Since IRD CBMS e-billing, bills (and credit notes) are queued automatically off Sales' own integration events
/// when the tenant has e-billing enabled; this command remains for sales that predate that (or were never queued),
/// and a failed submission is retried with <c>ResendIrdQueueItemCommand</c>.
/// </summary>
public sealed record SendIrdInvoiceCommand(Guid SaleId) : ICommand<SendIrdInvoiceResponseDto>;
