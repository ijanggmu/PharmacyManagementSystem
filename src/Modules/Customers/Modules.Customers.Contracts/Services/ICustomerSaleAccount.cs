namespace FSH.Modules.Customers.Contracts.Services;

/// <summary>What a sale puts on a customer's account: the balance left owing, and the loyalty points spent.</summary>
public sealed record SaleAccountPosting(
    Guid CustomerId,
    Guid SaleId,
    Guid BranchId,
    decimal BalanceDue,
    int PointsRedeemed,
    string? InvoiceNumber,
    // True when a manager approved going over the customer's credit limit for this sale.
    bool MayExceedCreditLimit);

/// <summary>
/// The cross-module surface Sales calls INSIDE its sale transaction (the Customers write joins it on the
/// scope's shared connection), so the customer's balance and points change in the same commit as the sale.
/// The customer row is locked first, so two sales for the same customer at once are checked one after the
/// other against the live balance: neither can spend the same points twice or pass the credit limit together.
/// </summary>
public interface ICustomerSaleAccount
{
    /// <summary>Throws a 409 <c>CustomException</c> when the balance would pass the credit limit (and no
    /// override was approved) or the customer doesn't hold the points.</summary>
    Task ApplySaleAsync(SaleAccountPosting posting, CancellationToken cancellationToken = default);
}
