using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>
/// Moves the cost of a received stock transfer from the source branch's Inventory to the destination
/// branch's. A voucher carries one branch, so the move is two balanced vouchers that meet in an
/// inter-branch (head-office) clearing account — Owner's Equity, the only system account both branches
/// share:
/// <list type="bullet">
///   <item>source branch (<c>StockTransferOut</c>): Dr Owner's Equity / Cr Inventory</item>
///   <item>destination branch (<c>StockTransferIn</c>): Dr Inventory / Cr Owner's Equity</item>
/// </list>
/// Tenant-wide both accounts net to zero; per branch, Inventory follows the stock. Each voucher is
/// posted at most once per transfer (looked up by its reference before posting, and the posted-voucher
/// unique index), so a redelivered event that already posted one leg only posts the missing one.
/// </summary>
public sealed class StockTransferReceivedIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver)
    : IIntegrationEventHandler<StockTransferReceivedIntegrationEvent>
{
    public const string OutReferenceType = "StockTransferOut";
    public const string InReferenceType = "StockTransferIn";

    public async Task HandleAsync(StockTransferReceivedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        decimal amount = decimal.Round(@event.TotalCost, 2, MidpointRounding.AwayFromZero);
        if (amount <= 0 || @event.FromBranchId == @event.ToBranchId)
        {
            return;
        }

        var inventoryAccountId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, ct).ConfigureAwait(false);
        var clearingAccountId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, ct).ConfigureAwait(false);

        if (await voucherPostingService.FindPostedVoucherIdAsync(OutReferenceType, @event.StockTransferId, ct).ConfigureAwait(false) is null)
        {
            await voucherPostingService.PostSystemVoucherAsync(
                new PostVoucherRequest(
                    VoucherType: "system_stock_transfer",
                    ReferenceType: OutReferenceType,
                    ReferenceId: @event.StockTransferId,
                    Narration: $"Stock transfer {@event.TransferNumber} sent to another branch",
                    Lines:
                    [
                        new PostVoucherLine(clearingAccountId, "Inter-branch transfer out", DebitAmount: amount, CreditAmount: 0m),
                        new PostVoucherLine(inventoryAccountId, "Stock sent", DebitAmount: 0m, CreditAmount: amount),
                    ],
                    BranchId: @event.FromBranchId),
                ct).ConfigureAwait(false);
        }

        if (await voucherPostingService.FindPostedVoucherIdAsync(InReferenceType, @event.StockTransferId, ct).ConfigureAwait(false) is null)
        {
            await voucherPostingService.PostSystemVoucherAsync(
                new PostVoucherRequest(
                    VoucherType: "system_stock_transfer",
                    ReferenceType: InReferenceType,
                    ReferenceId: @event.StockTransferId,
                    Narration: $"Stock transfer {@event.TransferNumber} received from another branch",
                    Lines:
                    [
                        new PostVoucherLine(inventoryAccountId, "Stock received", DebitAmount: amount, CreditAmount: 0m),
                        new PostVoucherLine(clearingAccountId, "Inter-branch transfer in", DebitAmount: 0m, CreditAmount: amount),
                    ],
                    BranchId: @event.ToBranchId),
                ct).ConfigureAwait(false);
        }
    }
}
