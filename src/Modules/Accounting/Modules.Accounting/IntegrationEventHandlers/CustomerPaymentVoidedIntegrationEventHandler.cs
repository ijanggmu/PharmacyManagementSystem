using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Customers.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Reverses the voucher posted for a customer payment (<see cref="CustomerPaymentRecordedIntegrationEventHandler"/>,
/// reference <c>CustomerPayment</c> / the payment's ledger entry id) with a reversing voucher dated at the void,
/// moved to the first open day when that falls in a locked period — the same system reversal path as
/// <see cref="SaleCancelledIntegrationEventHandler"/>. A void racing ahead of the payment's own delivery records a
/// "reversed before posted" marker, so the late payment voucher is posted and reversed at once; a redelivery is a no-op.</summary>
public sealed class CustomerPaymentVoidedIntegrationEventHandler(IVoucherPostingService voucherPostingService)
    : IIntegrationEventHandler<CustomerPaymentVoidedIntegrationEvent>
{
    public async Task HandleAsync(CustomerPaymentVoidedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        string payment = @event.ReceiptNumber ?? @event.LedgerEntryId.ToString();
        await voucherPostingService.ReverseSystemVoucherAsync(
            "CustomerPayment", @event.LedgerEntryId,
            $"Payment {payment} from customer '{@event.CustomerName}' voided: {@event.Reason}",
            @event.VoidedAtUtc, ct).ConfigureAwait(false);
    }
}
