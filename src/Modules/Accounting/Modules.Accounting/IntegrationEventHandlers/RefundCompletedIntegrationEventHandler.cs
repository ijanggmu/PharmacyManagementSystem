using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the GL voucher for a completed monetary refund: Dr Sales Returns &amp; Allowances /
/// Cr Cash for the net refund amount. Purely financial — unlike
/// <see cref="ReturnCompletedIntegrationEventHandler"/> there is no COGS/Inventory reversal, since a
/// refund never restocks (see <c>SaleRefund</c>'s own doc comment). Idempotent via the posted-voucher
/// unique index on (ReferenceType, ReferenceId).</summary>
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

        var salesReturnsId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.SalesReturnsAndAllowances, ct).ConfigureAwait(false);
        var cashId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash, ct).ConfigureAwait(false);

        var lines = new List<PostVoucherLine>
        {
            new(salesReturnsId, "Sales refund", DebitAmount: @event.NetRefundAmount, CreditAmount: 0m),
            new(cashId, "Cash refunded to customer", DebitAmount: 0m, CreditAmount: @event.NetRefundAmount),
        };

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest("system_refund", "Refund", @event.RefundId, $"Refund {@event.RefundId}", lines, BranchId: @event.BranchId),
            ct).ConfigureAwait(false);
    }
}
