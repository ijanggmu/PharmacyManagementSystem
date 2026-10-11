using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

public sealed record CancelPurchaseOrderCommand(Guid PurchaseOrderId, string Reason) : ICommand<Guid>;
