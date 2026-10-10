using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Suppliers.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the purchase-return voucher for goods sent back to a supplier: Dr Accounts Payable /
/// Cr Inventory for the return's cost — the same amount the Suppliers module credits to the supplier's
/// AP subledger, so the AP control account keeps matching it (return lines carry cost only, no VAT).
/// Mirrors <c>accounting_post_purchase_return_voucher</c>. Idempotent via the posted-voucher unique index
/// on (TenantId, ReferenceType, ReferenceId).</summary>
public sealed class SupplierReturnCreatedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<SupplierReturnCreatedIntegrationEvent>
{
    public async Task HandleAsync(SupplierReturnCreatedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.TotalCost <= 0)
        {
            return;
        }

        var accountsPayableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, ct).ConfigureAwait(false);
        var inventoryId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, ct).ConfigureAwait(false);

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_purchase_return",
                ReferenceType: "SupplierReturn",
                ReferenceId: @event.SupplierReturnId,
                Narration: $"Goods returned to supplier {@event.SupplierId}",
                Lines:
                [
                    new PostVoucherLine(accountsPayableId, "Payable reduced by return", DebitAmount: @event.TotalCost, CreditAmount: 0m),
                    new PostVoucherLine(inventoryId, "Stock returned to supplier", DebitAmount: 0m, CreditAmount: @event.TotalCost),
                ],
                BranchId: @event.BranchId),
            ct).ConfigureAwait(false);
    }
}
