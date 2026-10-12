using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Reverses the voucher posted for a sale, if one exists, with a reversing voucher dated at the
/// cancellation (moved to the first open day if that falls in a locked period). The original stays in
/// the ledger, so the sale's own period still shows the sale and the cancellation shows where it
/// happened — an outright void would silently rewrite a possibly-filed period. A cancellation racing
/// ahead of the original <see cref="SaleCompletedIntegrationEvent"/>'s delivery (its first attempt failed
/// and the outbox retries it later) records a "reversed before posted" marker, so when the sale voucher is
/// finally posted it is reversed at once instead of staying on the books.</summary>
public sealed class SaleCancelledIntegrationEventHandler(IVoucherPostingService voucherPostingService)
    : IIntegrationEventHandler<SaleCancelledIntegrationEvent>
{
    public async Task HandleAsync(SaleCancelledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        await voucherPostingService.ReverseSystemVoucherAsync(
            "Sale", @event.SaleId, $"Sale {@event.SaleId} cancelled: {@event.Reason}", @event.OccurredOnUtc, ct).ConfigureAwait(false);
    }
}
