using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// Ported from POST app/api/medicines/[id]/price-history/route.ts + `scheduleMedicinePriceChange`
/// (lib/server/services/price-history-service.ts, backed by the `schedule_medicine_price`
/// SQL function). An <c>EffectiveFrom</c> of today applies immediately (closes the current
/// 'Active' row and opens a new one); a future date queues a 'Scheduled' row instead, replacing
/// any still-pending schedule for the same medicine.
/// </summary>
public sealed record CreateMedicinePriceScheduleCommand(
    Guid MedicineId,
    decimal UnitPrice,
    DateOnly EffectiveFrom,
    decimal? CostPrice = null,
    string? Reason = null) : ICommand<Guid>;
