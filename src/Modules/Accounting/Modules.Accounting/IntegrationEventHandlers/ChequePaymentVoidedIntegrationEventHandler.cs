using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Customers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.Events;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>
/// Keeps the cheque register in step when a payment made by cheque is voided from the customer's / supplier's ledger
/// (not from the register): a cheque still in play is marked cancelled, so it no longer shows as due. A cheque the
/// register itself bounced or cancelled is already final and is left alone, as is a cleared one. Runs beside the
/// handlers that reverse the payment voucher; a redelivery finds nothing to change.
/// </summary>
public sealed class ChequePaymentVoidedIntegrationEventHandler(AccountingDbContext dbContext)
    : IIntegrationEventHandler<CustomerPaymentVoidedIntegrationEvent>,
      IIntegrationEventHandler<SupplierPaymentVoidedIntegrationEvent>
{
    public Task HandleAsync(CustomerPaymentVoidedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);
        return CancelAsync(Cheque.CustomerPaymentReference, @event.LedgerEntryId, @event.VoidedAtUtc, @event.Reason, ct);
    }

    public Task HandleAsync(SupplierPaymentVoidedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);
        return CancelAsync(Cheque.SupplierPaymentReference, @event.LedgerEntryId, @event.VoidedAtUtc, @event.Reason, ct);
    }

    private async Task CancelAsync(string referenceType, Guid paymentId, DateTime voidedAtUtc, string reason, CancellationToken ct)
    {
        // Tracked: the status change is saved below.
        var cheque = await dbContext.Cheques
            .Include(c => c.History)
            .FirstOrDefaultAsync(c => c.PaymentReferenceType == referenceType && c.PaymentReferenceId == paymentId, ct)
            .ConfigureAwait(false);
        if (cheque is null || !cheque.CancelForVoidedPayment(voidedAtUtc, reason))
        {
            return;
        }

        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
    }
}
