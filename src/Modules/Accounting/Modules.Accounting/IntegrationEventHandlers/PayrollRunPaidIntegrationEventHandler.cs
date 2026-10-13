using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Payroll.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>
/// Books a paid payroll run's salary payment (PMT), dated at the payment date on the run's branch: Dr Salaries Payable
/// 2200 / Cr the money account the payment method maps to (<see cref="IPaymentMethodAccountResolver"/> — cash, bank,
/// wallet). Idempotent via the posted-voucher unique index with the run id under its own reference type.
/// </summary>
public sealed class PayrollRunPaidIntegrationEventHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    IPaymentMethodAccountResolver paymentAccounts) : IIntegrationEventHandler<PayrollRunPaidIntegrationEvent>
{
    public async Task HandleAsync(PayrollRunPaidIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        decimal amount = AccountingVoucher.RoundAmount(@event.Amount);
        if (amount == 0m)
        {
            return;
        }

        Guid salariesPayableId = await PayrollAccounts.GetOrCreateAsync(dbContext, AccountingSystemAccountCodes.SalariesPayable, ct)
            .ConfigureAwait(false);
        Guid moneyAccountId = await paymentAccounts.ResolveAccountIdAsync(@event.PaymentMethod, ct).ConfigureAwait(false);
        string moneyLine = PaymentMethodAccounts.IsCash(@event.PaymentMethod) ? "Salaries paid in cash" : "Salaries paid from bank";

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: PayrollVoucherTypes.Payment,
                ReferenceType: PayrollVoucherTypes.PaymentReference,
                ReferenceId: @event.RunId,
                Narration: $"Salaries paid for {@event.PeriodLabel}",
                Lines:
                [
                    new PostVoucherLine(salariesPayableId, "Salaries payable settled", DebitAmount: amount, CreditAmount: 0m),
                    new PostVoucherLine(moneyAccountId, moneyLine, DebitAmount: 0m, CreditAmount: amount),
                ],
                BranchId: @event.BranchId,
                VoucherDateUtc: @event.PaidOnUtc),
            ct).ConfigureAwait(false);
    }
}
