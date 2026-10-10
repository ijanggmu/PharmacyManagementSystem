using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

public sealed record DeleteMedicineCommand(Guid MedicineId) : ICommand<Unit>;
