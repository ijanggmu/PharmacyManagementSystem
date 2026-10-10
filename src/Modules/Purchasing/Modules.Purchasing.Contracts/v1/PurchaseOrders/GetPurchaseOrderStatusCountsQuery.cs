using FSH.Modules.Purchasing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>Number of purchase orders per status, for the Purchases page summary cards.</summary>
public sealed record GetPurchaseOrderStatusCountsQuery(Guid? BranchId = null) : IQuery<PurchaseOrderStatusCountsDto>;
