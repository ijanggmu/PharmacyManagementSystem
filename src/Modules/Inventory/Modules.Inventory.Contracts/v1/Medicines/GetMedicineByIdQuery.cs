using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

public sealed record GetMedicineByIdQuery(Guid MedicineId) : IQuery<MedicineDto>;
