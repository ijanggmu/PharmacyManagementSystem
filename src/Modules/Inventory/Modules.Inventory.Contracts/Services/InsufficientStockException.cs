using System.Net;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Inventory.Contracts.Services;

/// <summary>
/// One medicine that couldn't be fully satisfied by <see cref="IStockDeductionService.DeductForSaleAsync"/>.
/// </summary>
public sealed record StockShortfall(Guid MedicineId, decimal Requested, decimal Available);

/// <summary>
/// Thrown by <see cref="IStockDeductionService.DeductForSaleAsync"/> when one or more lines can't be
/// fully covered — checked across ALL lines before any batch is mutated, so callers (Sales) never
/// see a partial deduction (pharmacy-modules-plan.md §4.4). Maps to 409 Conflict.
/// </summary>
public sealed class InsufficientStockException : CustomException
{
    public IReadOnlyList<StockShortfall> Shortfalls { get; }

    public InsufficientStockException(IReadOnlyList<StockShortfall> shortfalls)
        : base(
            "Insufficient stock for one or more items.",
            shortfalls.Select(s => $"Medicine {s.MedicineId}: requested {s.Requested}, available {s.Available}."),
            HttpStatusCode.Conflict)
    {
        Shortfalls = shortfalls;
    }

    public InsufficientStockException() : this([]) { }

    public InsufficientStockException(string message) : base(message) => Shortfalls = [];

    public InsufficientStockException(string message, Exception innerException)
        : base(message, innerException) => Shortfalls = [];
}
