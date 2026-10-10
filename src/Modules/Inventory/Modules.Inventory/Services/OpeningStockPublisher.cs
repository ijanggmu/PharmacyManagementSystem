using System.Diagnostics;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Publishes the GL side of stock added without a supplier (see
/// <see cref="OpeningStockReceivedIntegrationEvent"/>). Each call gets a fresh receipt id, so a
/// second receipt on the same medicine is never mistaken for a duplicate voucher.
/// </summary>
public static class OpeningStockPublisher
{
    public static async Task PublishAsync(
        IOutboxWriter outbox,
        ICurrentUser currentUser,
        decimal amount,
        string narration,
        Guid? branchId,
        CancellationToken cancellationToken)
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
            BranchId: branchId),
            cancellationToken).ConfigureAwait(false);
    }
}
