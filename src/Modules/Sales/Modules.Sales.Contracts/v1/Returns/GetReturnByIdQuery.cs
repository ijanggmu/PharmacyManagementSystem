using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Returns;

public sealed record GetReturnByIdQuery(Guid ReturnId) : IQuery<SaleReturnDto>;
