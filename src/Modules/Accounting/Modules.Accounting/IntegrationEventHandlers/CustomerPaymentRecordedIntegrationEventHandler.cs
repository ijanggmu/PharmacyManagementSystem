using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Customers.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the voucher for a customer payment: Dr Cash or Bank (received, per the event's payment
/// method — see <see cref="PaymentMethodAccounts"/>) / Cr Accounts Receivable (settled). Idempotent via the posted-voucher unique index on (TenantId, ReferenceType,
/// ReferenceId).</summary>
public sealed class CustomerPaymentRecordedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<CustomerPaymentRecordedIntegrationEvent>
{
    public async Task HandleAsync(CustomerPaymentRecordedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        bool cash = PaymentMethodAccounts.IsCash(@event.PaymentMethod);
        var moneyAccountId = await accountResolver
            .ResolveByCodeAsync(PaymentMethodAccounts.AccountCodeFor(@event.PaymentMethod), ct).ConfigureAwait(false);
        var accountsReceivableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsReceivable, ct).ConfigureAwait(false);

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_customer_payment",
                ReferenceType: "CustomerPayment",
                ReferenceId: @event.LedgerEntryId,
                Narration: $"Payment from customer '{@event.CustomerName}'" + (@event.Description is null ? "" : $" — {@event.Description}"),
                Lines:
                [
                    new PostVoucherLine(moneyAccountId, cash ? "Cash received" : "Received in bank", DebitAmount: @event.Amount, CreditAmount: 0m),
                    new PostVoucherLine(accountsReceivableId, "Accounts receivable settled", DebitAmount: 0m, CreditAmount: @event.Amount),
                ],
                BranchId: @event.BranchId),
            ct).ConfigureAwait(false);
    }
}
