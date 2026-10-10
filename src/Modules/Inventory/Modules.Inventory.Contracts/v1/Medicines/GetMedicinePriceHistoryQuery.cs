using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// Ported from GET app/api/medicines/[id]/price-history/route.ts + `listMedicinePriceHistory`
/// (lib/server/services/price-history-service.ts) — every non-cancelled row for one medicine,
/// newest effective date first.
/// </summary>
public sealed record GetMedicinePriceHistoryQuery(Guid MedicineId) : IQuery<List<MedicinePriceHistoryDto>>;
