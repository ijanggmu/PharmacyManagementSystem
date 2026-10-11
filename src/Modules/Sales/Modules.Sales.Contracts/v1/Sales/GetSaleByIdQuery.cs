using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Sales;

public sealed record GetSaleByIdQuery(Guid SaleId) : IQuery<SaleDto>;
