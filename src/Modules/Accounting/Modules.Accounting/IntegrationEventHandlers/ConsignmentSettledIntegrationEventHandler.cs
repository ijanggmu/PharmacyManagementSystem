using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the AP voucher for a consignment settlement: Dr Inventory / Cr Accounts Payable —
/// the stock was already on the books at receipt time (a real accounting simplification: this system
/// doesn't carry consigned stock off-balance-sheet, so the settlement just recognizes the payable, not
/// a new inventory asset). Idempotent via the posted-voucher unique index.</summary>
public sealed class ConsignmentSettledIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<ConsignmentSettledIntegrationEvent>
{
    public async Task HandleAsync(ConsignmentSettledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var inventoryAccountId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, ct).ConfigureAwait(false);
        var accountsPayableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, ct).ConfigureAwait(false);

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_consignment_settlement",
                ReferenceType: "ConsignmentSettlement",
                ReferenceId: @event.SettlementId,
                Narration: $"Consignment settlement for supplier {@event.SupplierId}",
                Lines:
                [
                    new PostVoucherLine(inventoryAccountId, "Consigned stock now owned", DebitAmount: @event.TotalAmount, CreditAmount: 0m),
                    new PostVoucherLine(accountsPayableId, "Payable to supplier", DebitAmount: 0m, CreditAmount: @event.TotalAmount),
                ],
                BranchId: @event.BranchId),
            ct).ConfigureAwait(false);
    }
}
