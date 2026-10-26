using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Appointments.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>
/// Books a payment to a doctor (PMT), dated when it was paid: Dr Doctor Fees Payable 2850 / Cr the money account the
/// payment method maps to. Idempotent via the posted-voucher unique index with the payout id.
/// </summary>
public sealed class DoctorPayoutPaidIntegrationEventHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    IPaymentMethodAccountResolver paymentAccounts) : IIntegrationEventHandler<DoctorPayoutPaidIntegrationEvent>
{
    public async Task HandleAsync(DoctorPayoutPaidIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        decimal amount = AccountingVoucher.RoundAmount(@event.Amount);
        if (amount <= 0m)
        {
            return;
        }

        Guid payableId = await AppointmentAccounts.GetOrCreateAsync(dbContext, AccountingSystemAccountCodes.DoctorFeesPayable, ct)
            .ConfigureAwait(false);
        Guid moneyAccountId = await paymentAccounts.ResolveAccountIdAsync(@event.PaymentMethod, ct).ConfigureAwait(false);

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: AppointmentVoucherTypes.Payout,
                ReferenceType: AppointmentVoucherTypes.PayoutReference,
                ReferenceId: @event.PayoutId,
                Narration: $"Paid {@event.DoctorName} their share of consultation fees",
                Lines:
                [
                    new PostVoucherLine(payableId, $"Owed to {@event.DoctorName} settled", DebitAmount: amount, CreditAmount: 0m),
                    new PostVoucherLine(moneyAccountId, "Doctor paid", DebitAmount: 0m, CreditAmount: amount),
                ],
                BranchId: @event.BranchId,
                VoucherDateUtc: @event.PaidOnUtc),
            ct).ConfigureAwait(false);
    }
}
