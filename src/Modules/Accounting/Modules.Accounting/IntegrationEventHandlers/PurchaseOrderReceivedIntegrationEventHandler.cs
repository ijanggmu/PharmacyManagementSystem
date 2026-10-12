using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Purchasing.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the AP voucher for a received purchase order: Dr Inventory (net) and, when the order
/// carries VAT, Dr Input VAT Recoverable (1150); Cr Accounts Payable for the gross amount. Idempotent via
/// the posted-voucher unique index on (TenantId, ReferenceType, ReferenceId).</summary>
public sealed class PurchaseOrderReceivedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<PurchaseOrderReceivedIntegrationEvent>
{
    public async Task HandleAsync(PurchaseOrderReceivedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        // Nothing to book for a zero-value receipt (free goods, or an order with no priced lines). Posting
        // would be rejected as an empty voucher and the event would retry until it dead-letters.
        if (AccountingVoucher.RoundAmount(@event.TotalAmount + @event.VatAmount) <= 0m)
        {
            return;
        }

        var inventoryAccountId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, ct).ConfigureAwait(false);
        var accountsPayableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, ct).ConfigureAwait(false);

        var lines = new List<PostVoucherLine>
        {
            new(inventoryAccountId, "Stock received", DebitAmount: @event.TotalAmount, CreditAmount: 0m),
        };

        if (@event.VatAmount > 0m)
        {
            var inputVatId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.InputVatRecoverable, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(inputVatId, "Input VAT on purchase", DebitAmount: @event.VatAmount, CreditAmount: 0m));
        }

        lines.Add(new PostVoucherLine(
            accountsPayableId, "Payable to supplier",
            DebitAmount: 0m, CreditAmount: @event.TotalAmount + @event.VatAmount));

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_purchase",
                ReferenceType: "PurchaseOrder",
                ReferenceId: @event.PurchaseOrderId,
                Narration: $"Purchase order {@event.PurchaseOrderId} received",
                Lines: lines,
                BranchId: @event.BranchId,
                // Raised when the goods are received; OrderDateUtc is when the order was placed.
                VoucherDateUtc: @event.ReceivedAtUtc ?? @event.OccurredOnUtc),
            ct).ConfigureAwait(false);
    }
}
