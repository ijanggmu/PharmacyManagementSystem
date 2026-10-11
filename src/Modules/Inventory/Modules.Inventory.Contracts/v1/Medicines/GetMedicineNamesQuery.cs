using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// In-process lookup of medicine names by id, for modules that store only a medicine id (e.g.
/// Purchasing order lines). Ids that are unknown or trashed are simply absent from the result.
/// No HTTP endpoint.
/// </summary>
public sealed record GetMedicineNamesQuery(IReadOnlyList<Guid> MedicineIds) : IQuery<IReadOnlyDictionary<Guid, string>>;
