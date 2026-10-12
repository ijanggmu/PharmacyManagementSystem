namespace FSH.Modules.Sales.Contracts.Dtos;

/// <summary>Settlement split of a prospective return/refund (see <c>GetReversalSettlementPreviewQuery</c>).
/// <see cref="OnAccountCap"/> is how much of any return/refund of the sale must still go to the customer's
/// account (the sale's open balance).</summary>
public sealed record ReversalSettlementPreviewDto(
    decimal Cash,
    decimal Bank,
    decimal OnAccount,
    decimal Total,
    decimal OnAccountCap);
