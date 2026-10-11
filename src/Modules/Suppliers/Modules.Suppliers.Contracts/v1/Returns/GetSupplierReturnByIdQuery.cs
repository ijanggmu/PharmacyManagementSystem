using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Returns;

public sealed record GetSupplierReturnByIdQuery(Guid ReturnId) : IQuery<SupplierReturnDto>;
