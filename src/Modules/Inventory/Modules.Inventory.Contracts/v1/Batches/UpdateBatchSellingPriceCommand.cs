using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Batches;

/// <summary>Sets the selling price of one batch (lot): the price a sale charges for units taken from it, e.g.
/// when a lot arrives with a different MRP printed on the pack. The lot keeps this price through later
/// medicine price changes, which only move lots still at the old medicine price. A price below the lot's cost needs
/// a manager approval (<paramref name="ApprovalTokens"/>, bound to the batch) unless the caller may approve.</summary>
public sealed record UpdateBatchSellingPriceCommand(Guid BatchId, decimal SellingPrice, IReadOnlyList<string>? ApprovalTokens = null)
    : ICommand<Guid>;
