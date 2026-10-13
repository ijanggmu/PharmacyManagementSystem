using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.StockCounts;

/// <summary>Creates a Draft count session for the caller's branch: every lot, or only the lots of one
/// category, one rack, or one preferred supplier. Nothing is snapshotted until it is started.</summary>
public sealed record CreateStockCountSessionCommand(
    string? Title = null,
    Guid? CategoryId = null,
    string? RackLocation = null,
    Guid? SupplierId = null,
    string? Notes = null) : ICommand<Guid>;

/// <summary>Draft → Counting: snapshots the system quantity of every in-scope lot with stock.</summary>
public sealed record StartStockCountSessionCommand(Guid SessionId) : ICommand<Guid>;

/// <summary>
/// One counted figure. Either <see cref="LineId"/> (a lot already on the sheet), or a found lot:
/// <see cref="MedicineId"/> with an existing <see cref="BatchId"/> of the branch, or a new
/// <see cref="BatchNo"/> (+ expiry) the system does not know. A null <see cref="CountedQuantity"/> clears
/// a line's count.
/// </summary>
public sealed record StockCountEntryInput(
    Guid? LineId,
    decimal? CountedQuantity,
    string? Note = null,
    Guid? MedicineId = null,
    Guid? BatchId = null,
    string? BatchNo = null,
    DateOnly? ExpiryDate = null,
    string? RackLocation = null);

/// <summary>Records counted quantities while the session is Counting. Returns the ids of the lines written.</summary>
public sealed record RecordStockCountsCommand(Guid SessionId, IReadOnlyList<StockCountEntryInput> Entries)
    : ICommand<IReadOnlyList<Guid>>;

public enum StockCountTransition
{
    /// <summary>Counting → Review.</summary>
    SubmitForReview = 0,

    /// <summary>Review → Counting.</summary>
    Reopen = 1,

    /// <summary>Draft / Counting / Review → Cancelled (stock untouched).</summary>
    Cancel = 2,
}

public sealed record ChangeStockCountStatusCommand(Guid SessionId, StockCountTransition Transition) : ICommand<Guid>;

/// <summary>
/// Review → Posted: applies every counted line's variance to its lot as one Adjustment movement per lot
/// and posts the stock gain and loss to the books (InventoryAdjustedIntegrationEvent), all in one
/// transaction. Uncounted lines are left untouched.
/// </summary>
public sealed record PostStockCountSessionCommand(Guid SessionId) : ICommand<StockCountSessionDto>;

public sealed record SearchStockCountSessionsQuery(
    string? Status = null,
    Guid? BranchId = null,
    int PageNumber = 1,
    int PageSize = 20) : IQuery<PagedResponse<StockCountSessionDto>>;

public sealed record GetStockCountSessionByIdQuery(Guid SessionId) : IQuery<StockCountSessionDetailDto>;
