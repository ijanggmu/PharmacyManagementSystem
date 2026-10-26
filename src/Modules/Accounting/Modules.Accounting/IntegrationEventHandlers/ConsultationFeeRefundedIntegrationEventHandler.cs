using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Appointments.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>
/// Reverses a cancelled visit's fee receipt, dated when the fee was given back (moved to the first open day if that
/// period is locked). Idempotent: an already-reversed receipt is left alone, and a refund that arrives before its
/// receipt marks the reference so the receipt is posted and reversed together (<see cref="IVoucherPostingService"/>).
/// </summary>
public sealed class ConsultationFeeRefundedIntegrationEventHandler(IVoucherPostingService voucherPostingService)
    : IIntegrationEventHandler<ConsultationFeeRefundedIntegrationEvent>
{
    public async Task HandleAsync(ConsultationFeeRefundedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        await voucherPostingService.ReverseSystemVoucherAsync(
            AppointmentVoucherTypes.FeeReference,
            @event.AppointmentId,
            $"Consultation fee given back: {@event.Reason}",
            @event.RefundedOnUtc,
            ct).ConfigureAwait(false);
    }
}
