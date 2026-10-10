using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Suppliers;

public sealed record RestoreSupplierCommand(Guid SupplierId) : ICommand<Guid>;
