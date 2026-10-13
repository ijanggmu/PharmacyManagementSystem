using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Inventory.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the voucher for stock added without a supplier, by how it was funded
/// (<see cref="OpeningStockReceivedIntegrationEvent.Funding"/>, see <see cref="StockFundingSources"/>):
/// <list type="bullet">
/// <item>Opening stock (the default, and events raised before funding was carried): Dr Inventory /
/// Cr Owner's Equity — the same entry the onboarding migration posts for opening stock
/// (CommitMigrationSessionCommandHandler), numbered in the opening (OB) series.</item>
/// <item>Paid in cash / by bank or wallet: Dr Inventory / Cr Cash or Bank (the account
/// <see cref="PaymentMethodAccounts"/> maps the method to), posted as a purchase (PUR series).</item>
/// </list>
/// Either way the Inventory account matches the stock subledger. Idempotent via the posted-voucher unique
/// index on (TenantId, ReferenceType, ReferenceId).</summary>
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

        string funding = StockFundingSources.Normalize(@event.Funding);
        bool paid = funding is StockFundingSources.Cash or StockFundingSources.Bank;

        PostVoucherRequest request;
        if (paid)
        {
            bool cash = PaymentMethodAccounts.IsCash(funding);
            var moneyAccountId = await accountResolver
                .ResolveByCodeAsync(PaymentMethodAccounts.AccountCodeFor(funding), ct).ConfigureAwait(false);

            request = new PostVoucherRequest(
                VoucherType: "system_purchase",
                ReferenceType: "InventoryStockPurchase",
                ReferenceId: @event.ReceiptId,
                Narration: @event.Narration,
                Lines:
                [
                    new PostVoucherLine(inventoryAccountId, "Stock purchased", DebitAmount: @event.Amount, CreditAmount: 0m),
                    new PostVoucherLine(moneyAccountId, cash ? "Cash paid out" : "Paid from bank", DebitAmount: 0m, CreditAmount: @event.Amount),
                ],
                BranchId: @event.BranchId,
                VoucherDateUtc: @event.ReceivedOnUtc);
        }
        else
        {
            var equityAccountId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, ct).ConfigureAwait(false);

            request = new PostVoucherRequest(
                VoucherType: "system_opening_stock",
                ReferenceType: "InventoryOpeningStock",
                ReferenceId: @event.ReceiptId,
                Narration: @event.Narration,
                Lines:
                [
                    new PostVoucherLine(inventoryAccountId, "Opening stock", DebitAmount: @event.Amount, CreditAmount: 0m),
                    new PostVoucherLine(equityAccountId, "Opening balance", DebitAmount: 0m, CreditAmount: @event.Amount),
                ],
                BranchId: @event.BranchId,
                VoucherDateUtc: @event.ReceivedOnUtc);
        }

        await voucherPostingService.PostSystemVoucherAsync(request, ct).ConfigureAwait(false);
    }
}
