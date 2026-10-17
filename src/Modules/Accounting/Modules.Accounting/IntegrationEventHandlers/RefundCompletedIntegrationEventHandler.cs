using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the GL voucher for a completed monetary refund: Dr Sales Returns &amp; Allowances /
/// Cr Cash for the net refund amount. Purely financial — unlike
/// <see cref="ReturnCompletedIntegrationEventHandler"/> there is no COGS/Inventory reversal, since a
/// refund never restocks (see <c>SaleRefund</c>'s own doc comment). Idempotent via the posted-voucher
/// unique index on (ReferenceType, ReferenceId).
/// <para>Events that carry the settlement split (<see cref="RefundCompletedIntegrationEvent.VatAmount"/> and
/// <see cref="RefundCompletedIntegrationEvent.GrossRefundAmount"/> set) reverse VAT Payable, credit
/// Cash/Bank/AR per where the money went and book any processing fee kept
/// (<see cref="SaleReversalVoucherLines"/>); older events keep the original Dr 4100 / Cr Cash posting.</para></summary>
public sealed class RefundCompletedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    IPaymentMethodAccountResolver paymentAccounts)
    : IIntegrationEventHandler<RefundCompletedIntegrationEvent>
{
    public async Task HandleAsync(RefundCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.NetRefundAmount <= 0)
        {
            return;
        }

        List<PostVoucherLine> lines;
        var settlement = new SaleReversalSettlementAmounts(
            @event.CashAmount, @event.BankAmount, @event.OnAccountAmount, @event.ProcessingFeeRetained, @event.RefundMethod);
        if (@event.VatAmount is { } vat)
        {
            // A new event (it carries the VAT split): its settlement must add up, compared at the stored
            // 2-decimal precision. A mismatch is a Sales-side bug — fail loudly (the event retries and then
            // dead-letters, where it is visible) instead of quietly booking the old cash-only entry, which
            // would leave VAT Payable and Bank/AR wrong with nothing to show for it.
            decimal gross = @event.GrossRefundAmount
                ?? throw new InvalidOperationException(
                    $"Refund {@event.RefundId} carries a VAT amount but no gross refund amount; the voucher can't be built.");
            decimal settled = AccountingVoucher.RoundAmount(settlement.Settled);
            if (settled != AccountingVoucher.RoundAmount(@event.NetRefundAmount)
                || AccountingVoucher.RoundAmount(settlement.Settled + settlement.FeeRetained) != AccountingVoucher.RoundAmount(gross))
            {
                throw new InvalidOperationException(
                    $"Refund {@event.RefundId} settlement doesn't add up: cash {@event.CashAmount} + bank {@event.BankAmount} + on account {@event.OnAccountAmount} " +
                    $"should equal the net refund {@event.NetRefundAmount}, and with the fee {@event.ProcessingFeeRetained} the gross {gross}.");
            }

            lines = await SaleReversalVoucherLines.BuildAsync(accountResolver, paymentAccounts, "Sales refund", gross, vat, settlement, ct)
                .ConfigureAwait(false);
        }
        else
        {
            // Legacy event raised before the settlement split existed: the original Dr 4100 / Cr Cash entry.
            var salesReturnsId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.SalesReturnsAndAllowances, ct).ConfigureAwait(false);
            var cashId = await paymentAccounts.ResolveAccountIdAsync(PaymentMethodAccounts.Cash, ct).ConfigureAwait(false);
            lines =
            [
                new(salesReturnsId, "Sales refund", DebitAmount: @event.NetRefundAmount, CreditAmount: 0m),
                new(cashId, "Cash refunded to customer", DebitAmount: 0m, CreditAmount: @event.NetRefundAmount),
            ];
        }

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest("system_refund", "Refund", @event.RefundId, $"Refund {@event.CreditNoteNumber ?? @event.RefundId.ToString()}", lines, BranchId: @event.BranchId, VoucherDateUtc: @event.OccurredOnUtc),
            ct).ConfigureAwait(false);
    }
}
