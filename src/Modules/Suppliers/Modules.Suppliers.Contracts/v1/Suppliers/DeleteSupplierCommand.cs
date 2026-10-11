using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Suppliers;

public sealed record DeleteSupplierCommand(Guid SupplierId) : ICommand<Unit>;
