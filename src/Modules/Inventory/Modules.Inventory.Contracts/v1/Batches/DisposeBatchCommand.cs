using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Batches;

/// <summary>Writes off the remaining quantity of a batch (expired/damaged) — zeroes it and marks disposed.</summary>
public sealed record DisposeBatchCommand(Guid BatchId, string Reason) : ICommand<Guid>;
