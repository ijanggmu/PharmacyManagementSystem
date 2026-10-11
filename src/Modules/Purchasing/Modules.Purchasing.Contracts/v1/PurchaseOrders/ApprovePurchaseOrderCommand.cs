using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

public sealed record ApprovePurchaseOrderCommand(Guid PurchaseOrderId) : ICommand<Guid>;
