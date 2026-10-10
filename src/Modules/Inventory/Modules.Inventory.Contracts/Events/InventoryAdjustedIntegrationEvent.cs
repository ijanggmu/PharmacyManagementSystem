using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Inventory.Contracts.Events;

/// <summary>
/// Raised (Outbox) when stock on hand changes outside a sale, purchase or transfer — a stock-count
/// correction, a batch quantity edit, or an expired/damaged batch write-off. <see cref="ValueChange"/>
/// is the signed cost of the change (quantity x the batch's cost): negative for a loss, positive for
/// a gain. Accounting posts it against Cost of Goods Sold, so Inventory keeps matching the stock
/// subledger: a loss is Dr COGS / Cr Inventory, a gain the reverse.
/// </summary>
public sealed record InventoryAdjustedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid AdjustmentId,
    decimal ValueChange,
    string Narration,
    Guid? BranchId = null)
    : IIntegrationEvent;
