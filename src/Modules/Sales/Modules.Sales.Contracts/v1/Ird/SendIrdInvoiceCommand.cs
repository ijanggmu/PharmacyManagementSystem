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
/// <b>Not automatic on sale completion</b> — the Next.js source only ever calls
/// <c>enqueueIrdInvoice</c> from this one explicit, user-triggered route; there is no call site on the
/// sale-creation path. So, unlike Accounting/Prescriptions reacting to
/// <c>SaleCompletedIntegrationEvent</c>, this command is deliberately NOT wired as an integration-event
/// handler — a cashier/admin action queues a sale for IRD, exactly as upstream.
/// </summary>
public sealed record SendIrdInvoiceCommand(Guid SaleId) : ICommand<SendIrdInvoiceResponseDto>;
