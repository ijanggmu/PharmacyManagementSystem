using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the opening-balance voucher for stock added without a supplier: Dr Inventory /
/// Cr Owner's Equity for the stock's cost — the same entry the onboarding migration posts for opening
/// stock (CommitMigrationSessionCommandHandler), so the Inventory account matches the stock subledger.
/// Idempotent via the posted-voucher unique index on (TenantId, ReferenceType, ReferenceId).</summary>
public sealed class OpeningStockReceivedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<OpeningStockReceivedIntegrationEvent>
{
    public async Task HandleAsync(OpeningStockReceivedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.Amount <= 0)
        {
            return;
        }

        var inventoryAccountId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, ct).ConfigureAwait(false);
        var equityAccountId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, ct).ConfigureAwait(false);

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_opening_stock",
                ReferenceType: "InventoryOpeningStock",
                ReferenceId: @event.ReceiptId,
                Narration: @event.Narration,
                Lines:
                [
                    new PostVoucherLine(inventoryAccountId, "Opening stock", DebitAmount: @event.Amount, CreditAmount: 0m),
                    new PostVoucherLine(equityAccountId, "Opening balance", DebitAmount: 0m, CreditAmount: @event.Amount),
                ],
                BranchId: @event.BranchId),
            ct).ConfigureAwait(false);
    }
}
