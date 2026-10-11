using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.StockTransfers;

public sealed record StockTransferLineInput(Guid MedicineId, decimal Quantity);

/// <summary>
/// Branch-to-branch stock transfer. Each branch is one stock location (the location id is the branch id),
/// so the client supplies branch ids only. <see cref="FromBranchId"/> must equal the caller's current
/// branch (<c>ICurrentBranch.RequireBranchIdAsync()</c>): stock is only drawn from the branch the user is
/// operating in. <see cref="ToBranchId"/> must be an active branch of the current tenant.
/// </summary>
public sealed record CreateStockTransferCommand(
    Guid FromBranchId,
    Guid ToBranchId,
    string? Notes,
    IReadOnlyList<StockTransferLineInput> Items) : ICommand<Guid>;
