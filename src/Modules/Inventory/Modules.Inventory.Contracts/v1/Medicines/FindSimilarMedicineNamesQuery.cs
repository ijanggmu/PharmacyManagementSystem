using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// Ported from app/api/medicines/similar-names/route.ts + `findSimilarMedicineNames`
/// (lib/server/services/medicine-service.ts) — LASA (look-alike-sound-alike) check used by the
/// create/edit medicine forms to warn staff before saving a name dangerously close to an
/// existing one.
/// </summary>
public sealed record FindSimilarMedicineNamesQuery(
    string Name,
    Guid? ExcludeId = null) : IQuery<List<SimilarMedicineNameDto>>;
