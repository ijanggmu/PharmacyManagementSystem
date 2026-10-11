using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Refunds;

public sealed record DeleteRefundCommand(Guid RefundId) : ICommand<Guid>;
