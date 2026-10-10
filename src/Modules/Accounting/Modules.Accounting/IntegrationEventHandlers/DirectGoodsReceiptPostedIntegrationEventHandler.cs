using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Purchasing.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the GL voucher for a direct (non-PO) goods receipt: Dr Inventory for the net amount
/// and, when the receipt carries VAT, Dr Input VAT Recoverable (account 1150) for
/// <see cref="DirectGoodsReceiptPostedIntegrationEvent.VatAmount"/>; Cr Accounts Payable for the gross
/// amount — same split as <see cref="PurchaseOrderReceivedIntegrationEventHandler"/>, no longer
/// capitalizing VAT into inventory cost. Idempotent via the posted-voucher unique index on
/// (TenantId, ReferenceType, ReferenceId).</summary>
public sealed class DirectGoodsReceiptPostedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<DirectGoodsReceiptPostedIntegrationEvent>
{
    public async Task HandleAsync(DirectGoodsReceiptPostedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.GrossAmount <= 0)
        {
            return;
        }

        var netAmount = @event.GrossAmount - @event.VatAmount;

        var inventoryAccountId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, ct).ConfigureAwait(false);
        var accountsPayableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, ct).ConfigureAwait(false);

        var lines = new List<PostVoucherLine>
        {
            new(inventoryAccountId, "Stock received directly from supplier", DebitAmount: netAmount, CreditAmount: 0m),
        };

        if (@event.VatAmount > 0m)
        {
            var inputVatId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.InputVatRecoverable, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(inputVatId, "Input VAT on direct goods receipt", DebitAmount: @event.VatAmount, CreditAmount: 0m));
        }

        lines.Add(new PostVoucherLine(accountsPayableId, "Payable to supplier", DebitAmount: 0m, CreditAmount: @event.GrossAmount));

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_purchase",
                ReferenceType: "DirectGoodsReceipt",
                ReferenceId: @event.ReceiptId,
                Narration: $"Direct goods receipt {@event.ReceiptId} (no purchase order)",
                Lines: lines,
                BranchId: @event.BranchId),
            ct).ConfigureAwait(false);
    }
}
