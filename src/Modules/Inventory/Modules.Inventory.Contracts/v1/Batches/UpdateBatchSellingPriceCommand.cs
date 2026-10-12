using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Batches;

/// <summary>Sets the selling price of one batch (lot) — the price a sale charges for units taken from it,
/// e.g. when a new lot arrives with a different MRP printed on the pack.</summary>
public sealed record UpdateBatchSellingPriceCommand(Guid BatchId, decimal SellingPrice) : ICommand<Guid>;
