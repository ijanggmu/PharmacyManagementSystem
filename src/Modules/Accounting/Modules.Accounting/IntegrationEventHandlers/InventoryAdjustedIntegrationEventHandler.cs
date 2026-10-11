using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts a stock adjustment or write-off against Cost of Goods Sold: a loss (shrinkage,
/// expiry, damage, count shortfall) is Dr COGS / Cr Inventory, a gain (count surplus) is Dr Inventory /
/// Cr COGS — shrinkage treated as part of cost of sales, so no extra account is needed. Idempotent via
/// the posted-voucher unique index on (TenantId, ReferenceType, ReferenceId).</summary>
public sealed class InventoryAdjustedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<InventoryAdjustedIntegrationEvent>
{
    public async Task HandleAsync(InventoryAdjustedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.ValueChange == 0)
        {
            return;
        }

        var inventoryAccountId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, ct).ConfigureAwait(false);
        var cogsAccountId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.CostOfGoodsSold, ct).ConfigureAwait(false);

        decimal amount = Math.Abs(@event.ValueChange);
        bool isLoss = @event.ValueChange < 0;

        PostVoucherLine[] lines = isLoss
            ?
            [
                new(cogsAccountId, "Stock loss / write-off", DebitAmount: amount, CreditAmount: 0m),
                new(inventoryAccountId, "Stock reduced", DebitAmount: 0m, CreditAmount: amount),
            ]
            :
            [
                new(inventoryAccountId, "Stock increased", DebitAmount: amount, CreditAmount: 0m),
                new(cogsAccountId, "Stock gain", DebitAmount: 0m, CreditAmount: amount),
            ];

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_inventory_adjustment",
                ReferenceType: "InventoryAdjustment",
                ReferenceId: @event.AdjustmentId,
                Narration: @event.Narration,
                Lines: lines,
                BranchId: @event.BranchId,
                VoucherDateUtc: @event.OccurredOnUtc),
            ct).ConfigureAwait(false);
    }
}
