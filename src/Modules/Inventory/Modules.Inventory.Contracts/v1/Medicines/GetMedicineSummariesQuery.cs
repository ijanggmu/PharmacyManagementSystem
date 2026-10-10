using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// In-process batch lookup of medicine display fields (name, generic name, strength, form) by id.
/// Trashed medicines are included so historical documents keep their labels; unknown ids are simply
/// absent from the result. No HTTP endpoint.
/// </summary>
public sealed record GetMedicineSummariesQuery(IReadOnlyList<Guid> MedicineIds)
    : IQuery<IReadOnlyList<MedicineSummaryDto>>
{
    /// <summary>Upper bound on ids per call — one page of sales lines is far below it.</summary>
    public const int MaxIds = 2000;
}
