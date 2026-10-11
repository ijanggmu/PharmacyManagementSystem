using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Batches;

/// <summary>Sets the batch to an audited absolute quantity (e.g. after a physical stock count) —
/// the delta is recorded as an InventoryTransaction of type Adjustment.</summary>
public sealed record AdjustBatchQuantityCommand(Guid BatchId, decimal NewQuantity, string Reason) : ICommand<Guid>;
