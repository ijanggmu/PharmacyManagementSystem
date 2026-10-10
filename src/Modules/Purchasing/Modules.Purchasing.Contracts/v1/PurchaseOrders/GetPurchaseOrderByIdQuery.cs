using FSH.Modules.Purchasing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

public sealed record GetPurchaseOrderByIdQuery(Guid PurchaseOrderId) : IQuery<PurchaseOrderDto>;
