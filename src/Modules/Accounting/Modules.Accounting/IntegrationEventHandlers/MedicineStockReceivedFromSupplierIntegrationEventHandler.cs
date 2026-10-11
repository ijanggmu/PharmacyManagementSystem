using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the purchase voucher for stock received on a medicine create or stock increase that
/// carried a supplier: Dr Inventory for the net amount and, when the receipt carries VAT, Dr Input VAT
/// Recoverable (account 1150) for <see cref="MedicineStockReceivedFromSupplierIntegrationEvent.VatAmount"/>;
/// Cr Accounts Payable for the gross amount — same split as
/// <see cref="PurchaseOrderReceivedIntegrationEventHandler"/> and
/// <see cref="DirectGoodsReceiptPostedIntegrationEventHandler"/>, no longer capitalizing VAT into
/// inventory cost. Idempotent via the posted-voucher unique index on (TenantId, ReferenceType, ReferenceId).</summary>
public sealed class MedicineStockReceivedFromSupplierIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<MedicineStockReceivedFromSupplierIntegrationEvent>
{
    public async Task HandleAsync(MedicineStockReceivedFromSupplierIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        // An event with lines is recorded by Purchasing as a direct goods receipt, which posts this
        // through DirectGoodsReceiptPostedIntegrationEvent (so voiding the receipt reverses it).
        if (@event.Lines is { Count: > 0 })
        {
            return;
        }

        if (@event.GrossAmount <= 0)
        {
            return;
        }

        var netAmount = @event.GrossAmount - @event.VatAmount;

        var inventoryAccountId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, ct).ConfigureAwait(false);
        var accountsPayableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, ct).ConfigureAwait(false);

        var lines = new List<PostVoucherLine>
        {
            new(inventoryAccountId, "Stock received from supplier", DebitAmount: netAmount, CreditAmount: 0m),
        };

        if (@event.VatAmount > 0m)
        {
            var inputVatId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.InputVatRecoverable, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(inputVatId, "Input VAT on stock receipt", DebitAmount: @event.VatAmount, CreditAmount: 0m));
        }

        lines.Add(new PostVoucherLine(accountsPayableId, "Payable to supplier", DebitAmount: 0m, CreditAmount: @event.GrossAmount));

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_purchase",
                ReferenceType: "MedicineStockReceipt",
                ReferenceId: @event.ReceiptId,
                Narration: $"Stock received for medicine {@event.MedicineId}",
                Lines: lines,
                BranchId: @event.BranchId,
                VoucherDateUtc: @event.ReceiptDateUtc),
            ct).ConfigureAwait(false);
    }
}
