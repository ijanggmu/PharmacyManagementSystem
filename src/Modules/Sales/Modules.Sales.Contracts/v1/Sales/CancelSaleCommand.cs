using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Sales;

/// <summary>
/// Cancels (voids) a completed sale. A caller without <c>Sales.Cancel</c> needs a manager approval for it:
/// one of <paramref name="ApprovalTokens"/>, bound to this sale (403 <c>approval_required</c> otherwise).
/// </summary>
public sealed record CancelSaleCommand(Guid SaleId, string Reason, IReadOnlyList<string>? ApprovalTokens = null) : ICommand<Guid>;
