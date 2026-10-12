using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>
/// Posts the GL voucher for a completed customer return's goods: Dr Inventory / Cr COGS at cost for the
/// units put back on the shelf (sealed packs; an opened or damaged pack is not restocked, so its cost
/// stays in COGS as the loss). Uses this .NET COA's codes — Inventory=1200, COGS=5000.
///
/// The money goes back through the return's payout refund (<c>RefundCompletedIntegrationEvent</c>:
/// cash, VAT, credit note). Only events raised before returns paid out through a refund
/// (<c>MoneyRefundedSeparately</c> false) still post the money here, as scripts/80 did: Dr Sales Returns
/// &amp; Allowances / Cr Cash for the return total.
/// Idempotent via the posted-voucher unique index on (ReferenceType, ReferenceId).
/// </summary>
public sealed class ReturnCompletedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<ReturnCompletedIntegrationEvent>
{
    public async Task HandleAsync(ReturnCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var lines = new List<PostVoucherLine>();

        if (!@event.MoneyRefundedSeparately && @event.TotalReturnAmount > 0)
        {
            var salesReturnsId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.SalesReturnsAndAllowances, ct).ConfigureAwait(false);
            var cashId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(salesReturnsId, "Sales return / allowance", DebitAmount: @event.TotalReturnAmount, CreditAmount: 0m));
            lines.Add(new PostVoucherLine(cashId, "Cash / credit issued to customer", DebitAmount: 0m, CreditAmount: @event.TotalReturnAmount));
        }

        decimal cogsReversal = Math.Round(
            @event.Lines.Where(l => l.Restock).Sum(l => l.Quantity * l.UnitCostPrice), 2, MidpointRounding.AwayFromZero);
        if (cogsReversal > 0)
        {
            var inventoryId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, ct).ConfigureAwait(false);
            var cogsId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.CostOfGoodsSold, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(inventoryId, "Inventory restocked from return", DebitAmount: cogsReversal, CreditAmount: 0m));
            lines.Add(new PostVoucherLine(cogsId, "Reverse COGS", DebitAmount: 0m, CreditAmount: cogsReversal));
        }

        if (lines.Count == 0)
        {
            return;
        }

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest("system_sales_return", "Return", @event.ReturnId, $"Customer return {@event.ReturnId}", lines, BranchId: @event.BranchId),
            ct).ConfigureAwait(false);
    }
}
