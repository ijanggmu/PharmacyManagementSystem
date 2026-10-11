using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Suppliers;

public sealed record GetSupplierByIdQuery(Guid SupplierId) : IQuery<SupplierDto>;
