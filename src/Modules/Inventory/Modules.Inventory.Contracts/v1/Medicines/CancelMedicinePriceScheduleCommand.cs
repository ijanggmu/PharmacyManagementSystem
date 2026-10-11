using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// Ported from DELETE app/api/medicines/[id]/price-history/[historyId]/route.ts +
/// `cancelScheduledMedicinePrice` (lib/server/services/price-history-service.ts, backed by the
/// `cancel_scheduled_medicine_price` SQL function). Only a still-pending 'Scheduled' row can be
/// cancelled.
/// </summary>
public sealed record CancelMedicinePriceScheduleCommand(Guid MedicineId, Guid HistoryId) : ICommand<Unit>;
