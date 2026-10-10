using System.Diagnostics;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Publishes the GL side of a stock adjustment or write-off (see
/// <see cref="InventoryAdjustedIntegrationEvent"/>). Each call gets a fresh adjustment id, so two
/// adjustments on the same batch or medicine never collide on the voucher's idempotency key.
/// </summary>
public static class InventoryAdjustmentPublisher
{
    public static async Task PublishAsync(
        IOutboxWriter outbox,
        ICurrentUser currentUser,
        decimal valueChange,
        string narration,
        Guid? branchId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(outbox);
        ArgumentNullException.ThrowIfNull(currentUser);

        if (valueChange == 0)
        {
            return;
        }

        await outbox.AddAsync(new InventoryAdjustedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
            Source: "Inventory",
            AdjustmentId: Guid.CreateVersion7(),
            ValueChange: valueChange,
            Narration: narration,
            BranchId: branchId),
            cancellationToken).ConfigureAwait(false);
    }
}
