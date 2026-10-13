namespace FSH.Modules.Identity.Contracts.Approvals;

/// <summary>
/// The restricted actions a manager approval can be issued for. An approval token is bound to exactly one
/// of these (plus an amount ceiling, the requesting user and a target), so a token issued for a discount
/// can never be spent on a void.
/// </summary>
public static class ApprovalActions
{
    /// <summary>A sale discount above the cashier's per-role cap. Amount: the discount percent.</summary>
    public const string SaleDiscount = "sale.discount";

    /// <summary>Cancelling (voiding) a completed sale. Amount: the sale total. Target: the sale id.</summary>
    public const string SaleVoid = "sale.void";

    /// <summary>A refund above the tenant's approval threshold. Amount: the net refund. Target: the sale id.</summary>
    public const string SaleRefund = "sale.refund";

    /// <summary>A credit sale past the customer's credit limit. Amount: the balance put on account.</summary>
    public const string CreditOverride = "sale.credit_override";

    /// <summary>Re-pricing a lot below its cost. Amount: the shortfall per unit. Target: the batch id.</summary>
    public const string PriceBelowCost = "inventory.price_below_cost";

    public static IReadOnlyList<string> All { get; } = [SaleDiscount, SaleVoid, SaleRefund, CreditOverride, PriceBelowCost];

    public static bool IsKnown(string? action) => action is not null && All.Contains(action, StringComparer.Ordinal);
}
