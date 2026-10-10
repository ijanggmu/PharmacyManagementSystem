using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Refunds;

public sealed record GetRefundByIdQuery(Guid RefundId) : IQuery<SaleRefundDto>;
