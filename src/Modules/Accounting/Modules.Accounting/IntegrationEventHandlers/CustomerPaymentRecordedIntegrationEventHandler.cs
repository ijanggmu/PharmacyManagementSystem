using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Customers.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the voucher for a customer payment: Dr Cash or Bank (received, per the event's payment
/// method — see <see cref="IPaymentMethodAccountResolver"/>) / Cr Accounts Receivable (settled). Idempotent via the posted-voucher unique index on (TenantId, ReferenceType,
/// ReferenceId).
/// <para>A cheque with its number (<see cref="ChequeRegister.IsRegistered"/>) is entered in the cheque register in the
/// same save, and — unless the user chose "cleared on deposit" — debited to Cheques in Hand instead of the bank: a
/// post-dated cheque is not money in the bank until it clears.</para></summary>
public sealed class CustomerPaymentRecordedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    IPaymentMethodAccountResolver paymentAccounts,
    AccountingDbContext dbContext)
    : IIntegrationEventHandler<CustomerPaymentRecordedIntegrationEvent>
{
    public async Task HandleAsync(CustomerPaymentRecordedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        bool cash = PaymentMethodAccounts.IsCash(@event.PaymentMethod);
        bool cheque = ChequeRegister.IsRegistered(@event.PaymentMethod, @event.ChequeNumber);
        bool chequeInHand = cheque && !@event.ChequeClearedOnDeposit;
        DateTime paymentDateUtc = @event.PaymentDateUtc ?? @event.OccurredOnUtc;

        // Resolved (and, for Cheques in Hand, created on first use) before the cheque is added, so that account's
        // own save can't commit the cheque ahead of the voucher.
        var moneyAccountId = chequeInHand
            ? await ChequeAccounts.HoldingAccountAsync(dbContext, ChequeDirection.Received, ct).ConfigureAwait(false)
            : await paymentAccounts.ResolveAccountIdAsync(@event.PaymentMethod, ct).ConfigureAwait(false);
        var accountsReceivableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsReceivable, ct).ConfigureAwait(false);

        if (cheque)
        {
            // Saved together with the voucher below (PostSystemVoucherAsync saves once).
            await ChequeRegister.AddOnceAsync(dbContext, Cheque.CreateReceived(
                @event.CustomerId, @event.CustomerName, @event.ChequeNumber!, @event.ChequeDateUtc ?? paymentDateUtc,
                @event.ChequeBank, @event.Amount, @event.LedgerEntryId, paymentDateUtc,
                postedToBank: !chequeInHand, @event.BranchId, @event.Description), ct).ConfigureAwait(false);
        }

        string moneyLine = cash ? "Cash received" : "Received in bank";
        if (chequeInHand)
        {
            moneyLine = $"Cheque {@event.ChequeNumber!.Trim()} in hand";
        }

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_customer_payment",
                ReferenceType: "CustomerPayment",
                ReferenceId: @event.LedgerEntryId,
                Narration: $"Payment from customer '{@event.CustomerName}'" + (@event.Description is null ? "" : $" — {@event.Description}"),
                Lines:
                [
                    new PostVoucherLine(moneyAccountId, moneyLine, DebitAmount: @event.Amount, CreditAmount: 0m),
                    new PostVoucherLine(accountsReceivableId, "Accounts receivable settled", DebitAmount: 0m, CreditAmount: @event.Amount),
                ],
                BranchId: @event.BranchId,
                // The payment date the user recorded, not when the event was processed (older events
                // without it fall back to when they were raised).
                VoucherDateUtc: paymentDateUtc),
            ct).ConfigureAwait(false);
    }
}
