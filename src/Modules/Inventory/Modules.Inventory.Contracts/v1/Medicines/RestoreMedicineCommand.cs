using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

public sealed record RestoreMedicineCommand(Guid MedicineId) : ICommand<Guid>;
