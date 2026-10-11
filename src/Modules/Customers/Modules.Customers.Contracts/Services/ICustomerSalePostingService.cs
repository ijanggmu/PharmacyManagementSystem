namespace FSH.Modules.Customers.Contracts.Services;

/// <summary>
/// What a sale puts on a customer's account, applied synchronously inside the caller's (Sales) transaction.
/// </summary>
/// <param name="CustomerId">The sale's customer.</param>
/// <param name="SaleId">The sale — the ledger entry's reference and the loyalty entry's sale.</param>
/// <param name="BranchId">Branch the sale was transacted at (stamped on the entries).</param>
/// <param name="BalanceDue">Amount the sale leaves on account (0 when paid in full).</param>
/// <param name="PointsRedeemed">Loyalty points spent on the sale (0 when none).</param>
/// <param name="MayExceedCreditLimit">The caller holds the credit-limit override and asked for it.</param>
/// <param name="InvoiceNumber">The sale's invoice number, for the ledger entry's document number.</param>
public sealed record CustomerSalePosting(
    Guid CustomerId,
    Guid SaleId,
    Guid BranchId,
    decimal BalanceDue,
    int PointsRedeemed,
    bool MayExceedCreditLimit,
    string? InvoiceNumber);

/// <summary>
/// Applies a sale's balance-on-account and loyalty redemption to the customer IN the caller's open
/// transaction (the scope's shared connection — the same pattern as Inventory's
/// <c>IStockDeductionService</c>), under a row lock on the customer.
///
/// <para>Why synchronous: the credit-limit and points checks must see every earlier sale of the customer.
/// When the balance was only updated later by the asynchronous <c>SaleCompleted</c> handler, two sales rung
/// up close together both read the old balance and could together exceed the limit or spend the same points
/// twice. With the customer row locked for the rest of the sale's transaction, concurrent sales of the same
/// customer serialize and each one checks against the committed balance/points of the previous one.</para>
///
/// <para>Throws a 409 when the sale would take the customer past their credit limit (unless
/// <see cref="CustomerSalePosting.MayExceedCreditLimit"/>), or when the customer no longer holds the points
/// being redeemed — the redemption fails; it is never silently reduced. 404 when the customer is unknown.</para>
///
/// <para>Idempotent per sale: an AR entry / redemption already recorded for the sale is not applied twice
/// (the asynchronous <c>SaleCompleted</c> handler also skips what this already applied).</para>
/// </summary>
public interface ICustomerSalePostingService
{
    Task PostSaleAsync(CustomerSalePosting posting, CancellationToken cancellationToken = default);
}
