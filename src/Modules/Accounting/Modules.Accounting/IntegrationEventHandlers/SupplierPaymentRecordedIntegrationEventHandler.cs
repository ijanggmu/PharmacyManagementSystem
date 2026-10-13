using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Suppliers.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the voucher for a supplier payment: Dr Accounts Payable (settled) / Cr Cash or Bank
/// (paid out, per the event's payment method — see <see cref="IPaymentMethodAccountResolver"/>). Idempotent via the posted-voucher unique index on (TenantId, ReferenceType,
/// ReferenceId).</summary>
public sealed class SupplierPaymentRecordedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    IPaymentMethodAccountResolver paymentAccounts)
    : IIntegrationEventHandler<SupplierPaymentRecordedIntegrationEvent>
{
    public async Task HandleAsync(SupplierPaymentRecordedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var accountsPayableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, ct).ConfigureAwait(false);
        bool cash = PaymentMethodAccounts.IsCash(@event.PaymentMethod);
        var moneyAccountId = await paymentAccounts.ResolveAccountIdAsync(@event.PaymentMethod, ct).ConfigureAwait(false);

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_supplier_payment",
                ReferenceType: "SupplierPayment",
                ReferenceId: @event.LedgerEntryId,
                Narration: $"Payment to supplier '{@event.SupplierName}'" + (@event.Description is null ? "" : $" — {@event.Description}"),
                Lines:
                [
                    new PostVoucherLine(accountsPayableId, "Accounts payable settled", DebitAmount: @event.Amount, CreditAmount: 0m),
                    new PostVoucherLine(moneyAccountId, cash ? "Cash paid out" : "Paid from bank", DebitAmount: 0m, CreditAmount: @event.Amount),
                ],
                BranchId: @event.BranchId,
                // The payment date the user recorded, not when the event was processed (older events
                // without it fall back to when they were raised).
                VoucherDateUtc: @event.PaymentDateUtc ?? @event.OccurredOnUtc),
            ct).ConfigureAwait(false);
    }
}
