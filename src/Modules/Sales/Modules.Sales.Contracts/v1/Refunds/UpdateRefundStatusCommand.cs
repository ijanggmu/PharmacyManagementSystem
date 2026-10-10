using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Refunds;

public sealed record UpdateRefundStatusCommand(
    Guid RefundId,
    string? Status = null,
    string? RefundReason = null,
    string? Notes = null) : ICommand<Guid>;
