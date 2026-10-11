using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Inventory.Domain;

/// <summary>
/// Ported from Next.js `medicine_price_history` (scripts/102-price-list-versioning.sql).
/// The source table also has a <c>source</c> column ('trigger' vs 'manual') because a DB
/// trigger auto-captures every direct <c>medicines.unit_price</c>/<c>cost_price</c> edit. This
/// .NET port's <see cref="Medicine"/> aggregate carries no price field yet (see
/// CreateMedicinePriceScheduleCommandHandler remarks), so there is no trigger-equivalent path —
/// every row created here is the "manual" (scheduling API) kind, and the <c>source</c> column
/// was dropped as always-constant.
/// </summary>
public enum MedicinePriceHistoryStatus
{
    Scheduled = 0,
    Active = 1,
    Superseded = 2,
    Cancelled = 3,
}

public sealed class MedicinePriceHistory : AggregateRoot<Guid>
{
    public Guid MedicineId { get; private set; }
    public decimal UnitPrice { get; private set; }
    public decimal? CostPrice { get; private set; }
    public DateOnly EffectiveFrom { get; private set; }
    public DateOnly? EffectiveTo { get; private set; }
    public MedicinePriceHistoryStatus Status { get; private set; }
    public string? Reason { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private MedicinePriceHistory() { }

    private static MedicinePriceHistory CreateCore(
        Guid medicineId, decimal unitPrice, decimal? costPrice, DateOnly effectiveFrom,
        MedicinePriceHistoryStatus status, string? reason)
    {
        if (unitPrice < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(unitPrice), unitPrice, "Price cannot be negative.");
        }

        if (costPrice is < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(costPrice), costPrice, "Cost price cannot be negative.");
        }

        return new MedicinePriceHistory
        {
            Id = Guid.CreateVersion7(),
            MedicineId = medicineId,
            UnitPrice = unitPrice,
            CostPrice = costPrice,
            EffectiveFrom = effectiveFrom,
            Status = status,
            Reason = reason?.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    /// <summary>Immediate price change — mirrors `schedule_medicine_price`'s
    /// <c>p_effective_from = CURRENT_DATE</c> branch.</summary>
    public static MedicinePriceHistory CreateActive(
        Guid medicineId, decimal unitPrice, decimal? costPrice, DateOnly effectiveFrom, string? reason)
        => CreateCore(medicineId, unitPrice, costPrice, effectiveFrom, MedicinePriceHistoryStatus.Active, reason);

    /// <summary>Future-dated price change — mirrors `schedule_medicine_price`'s future branch.</summary>
    public static MedicinePriceHistory CreateScheduled(
        Guid medicineId, decimal unitPrice, decimal? costPrice, DateOnly effectiveFrom, string? reason)
        => CreateCore(medicineId, unitPrice, costPrice, effectiveFrom, MedicinePriceHistoryStatus.Scheduled, reason);

    /// <summary>Closes an 'Active' row when a new price takes effect.</summary>
    public void Supersede(DateOnly effectiveTo)
    {
        EnsureStatus(MedicinePriceHistoryStatus.Active);
        EffectiveTo = effectiveTo;
        Status = MedicinePriceHistoryStatus.Superseded;
    }

    /// <summary>Cancels a still-pending 'Scheduled' row — either because a newer schedule
    /// replaced it, or the user explicitly cancelled it.</summary>
    public void Cancel()
    {
        EnsureStatus(MedicinePriceHistoryStatus.Scheduled);
        Status = MedicinePriceHistoryStatus.Cancelled;
    }

    private void EnsureStatus(MedicinePriceHistoryStatus expected)
    {
        if (Status != expected)
        {
            throw new CustomException(
                $"Price history row {Id} is {Status}, expected {expected}.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
