using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Appointments.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>
/// Books a consultation fee (RCT), dated when it was taken, on the visit's branch: Dr the money account the payment
/// method maps to (<see cref="IPaymentMethodAccountResolver"/>) for the whole fee / Cr Doctor Fees Payable 2850 for the
/// doctor's share / Cr Consultation Fee Income 4810 for the rest. Zero lines are left out. Idempotent via the
/// posted-voucher unique index with the appointment id.
/// </summary>
public sealed class ConsultationFeeCollectedIntegrationEventHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    IPaymentMethodAccountResolver paymentAccounts) : IIntegrationEventHandler<ConsultationFeeCollectedIntegrationEvent>
{
    public async Task HandleAsync(ConsultationFeeCollectedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        decimal amount = AccountingVoucher.RoundAmount(@event.Amount);
        if (amount <= 0m)
        {
            return;
        }

        decimal doctorShare = Math.Min(AccountingVoucher.RoundAmount(@event.DoctorShare), amount);
        decimal pharmacyShare = amount - doctorShare;

        Guid moneyAccountId = await paymentAccounts.ResolveAccountIdAsync(@event.PaymentMethod, ct).ConfigureAwait(false);
        var lines = new List<PostVoucherLine>
        {
            new(moneyAccountId, $"Consultation fee from {@event.PatientName}", DebitAmount: amount, CreditAmount: 0m),
        };

        if (doctorShare > 0m)
        {
            Guid payableId = await AppointmentAccounts.GetOrCreateAsync(dbContext, AccountingSystemAccountCodes.DoctorFeesPayable, ct)
                .ConfigureAwait(false);
            lines.Add(new PostVoucherLine(payableId, $"Owed to {@event.DoctorName}", DebitAmount: 0m, CreditAmount: doctorShare));
        }

        if (pharmacyShare > 0m)
        {
            Guid incomeId = await AppointmentAccounts.GetOrCreateAsync(dbContext, AccountingSystemAccountCodes.ConsultationFeeIncome, ct)
                .ConfigureAwait(false);
            lines.Add(new PostVoucherLine(incomeId, "Pharmacy's part of the consultation fee", DebitAmount: 0m, CreditAmount: pharmacyShare));
        }

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: AppointmentVoucherTypes.Fee,
                ReferenceType: AppointmentVoucherTypes.FeeReference,
                ReferenceId: @event.AppointmentId,
                Narration: $"Consultation fee, {@event.DoctorName}, token {@event.TokenNo}",
                Lines: lines,
                BranchId: @event.BranchId,
                VoucherDateUtc: @event.PaidOnUtc),
            ct).ConfigureAwait(false);
    }
}
