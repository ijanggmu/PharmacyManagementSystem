using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
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
    IAccountingAccountResolver accountResolver)
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
            @event.CashAmount, @event.BankAmount, @event.OnAccountAmount, @event.ProcessingFeeRetained);
        if (@event.VatAmount is { } vat
            && @event.GrossRefundAmount is { } gross
            && settlement.Settled == @event.NetRefundAmount
            && settlement.Settled + settlement.FeeRetained == gross)
        {
            lines = await SaleReversalVoucherLines.BuildAsync(accountResolver, "Sales refund", gross, vat, settlement, ct)
                .ConfigureAwait(false);
        }
        else
        {
            var salesReturnsId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.SalesReturnsAndAllowances, ct).ConfigureAwait(false);
            var cashId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash, ct).ConfigureAwait(false);
            lines =
            [
                new(salesReturnsId, "Sales refund", DebitAmount: @event.NetRefundAmount, CreditAmount: 0m),
                new(cashId, "Cash refunded to customer", DebitAmount: 0m, CreditAmount: @event.NetRefundAmount),
            ];
        }

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest("system_refund", "Refund", @event.RefundId, $"Refund {@event.RefundId}", lines, BranchId: @event.BranchId),
            ct).ConfigureAwait(false);
    }
}
