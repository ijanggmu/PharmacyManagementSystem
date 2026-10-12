using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Sales;

/// <summary>
/// How a return/refund of <paramref name="Amount"/> against the sale would be settled right now with
/// <paramref name="RefundMethod"/> — the same rule applied when it completes: the sale's still-open balance is
/// credited to the customer's account first, the rest follows the method. Lets the counter show "hand back
/// Rs X cash / credit Rs Y to the account" before submitting. 400 for store credit on a walk-in sale.
/// </summary>
public sealed record GetReversalSettlementPreviewQuery(Guid SaleId, decimal Amount, string? RefundMethod = null)
    : IQuery<ReversalSettlementPreviewDto>;
