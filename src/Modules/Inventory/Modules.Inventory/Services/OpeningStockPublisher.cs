using System.Diagnostics;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Publishes the GL side of stock added without a supplier (see
/// <see cref="OpeningStockReceivedIntegrationEvent"/>). Each call gets a fresh receipt id, so a
/// second receipt on the same medicine is never mistaken for a duplicate voucher. <c>funding</c>
/// (see <see cref="StockFundingSources"/>) says what the stock was paid with; omitted means opening stock.
/// </summary>
public static class OpeningStockPublisher
{
    public static async Task PublishAsync(
        IOutboxWriter outbox,
        ICurrentUser currentUser,
        decimal amount,
        string narration,
        Guid? branchId,
        CancellationToken cancellationToken,
        string? funding = null)
    {
        ArgumentNullException.ThrowIfNull(outbox);
        ArgumentNullException.ThrowIfNull(currentUser);

        if (amount <= 0)
        {
            return;
        }

        await outbox.AddAsync(new OpeningStockReceivedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
            Source: "Inventory",
            ReceiptId: Guid.CreateVersion7(),
            Amount: amount,
            ReceivedOnUtc: DateTime.UtcNow,
            Narration: narration,
            BranchId: branchId,
            Funding: StockFundingSources.Normalize(funding)),
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>The voucher narration: <paramref name="openingStockNarration"/> for opening stock, otherwise
    /// "Stock bought for cash / by bank: <paramref name="subject"/>".</summary>
    public static string NarrationFor(string? funding, string openingStockNarration, string subject) =>
        StockFundingSources.Normalize(funding) switch
        {
            StockFundingSources.Cash => $"Stock bought for cash (no supplier bill): {subject}",
            StockFundingSources.Bank => $"Stock bought by bank/wallet (no supplier bill): {subject}",
            _ => openingStockNarration,
        };
}
