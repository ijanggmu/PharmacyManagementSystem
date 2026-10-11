using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Sales;

/// <summary>
/// Creates and completes a sale in one step (no draft state — see PurchaseOrder/AccountingVoucher
/// for the draft pattern; a POS sale is atomic-or-nothing by nature).
///
/// Tender: pass <paramref name="Payments"/> for split tender (its amounts must cover the server-priced
/// total, or include a <c>credit</c> leg for the balance on account). When <paramref name="Payments"/>
/// is omitted, the legacy single-payment shape (<paramref name="PaymentMethod"/> +
/// <paramref name="PaymentAmount"/>) is used and any shortfall is the balance on account.
///
/// Unit prices are always resolved server-side; client-sent prices are ignored.
///
/// Safety: the cart is checked for drug interactions (<see cref="Contracts.Safety.DrugInteractionReference"/>)
/// and, when <paramref name="CustomerId"/> is set, against the customer's recorded allergies — before
/// any stock is deducted. A match throws <see cref="Contracts.Safety.SafetyWarningException"/> (409)
/// unless <paramref name="AcknowledgeWarnings"/> is <c>true</c>, mirroring the legacy
/// <c>acknowledge_safety_warnings</c> checkout override. Controlled-substance dispensing (prescription
/// required, not expired/cancelled, quantity within what remains) is enforced separately and always,
/// regardless of this flag, by Prescriptions' <c>IDispensingSafetyPolicy</c>.
///
/// Credit limit: when the customer has one, the balance this sale puts on account plus what they
/// already owe must stay within it, or the sale is refused (409) — unless
/// <paramref name="OverrideCreditLimit"/> is set by a caller holding
/// <c>Sales.OverrideCreditLimit</c> (403 otherwise).
///
/// Loyalty: <paramref name="RedeemLoyaltyPoints"/> spends the member's points as a discount. The
/// client applies their value (points × the programme's point value) as line discounts; the server
/// checks the programme is on, the customer is a member with enough points, and that the sale's
/// discounts cover the value, then records the redemption (the Customers module deducts the points).
/// </summary>
public sealed record CreateSaleCommand(
    Guid? CustomerId,
    IReadOnlyList<SaleItemInput> Items,
    string? PaymentMethod,
    decimal PaymentAmount,
    Guid? PrescriptionId = null,
    string? Notes = null,
    IReadOnlyList<SalePaymentInput>? Payments = null,
    bool AcknowledgeWarnings = false,
    bool OverrideCreditLimit = false,
    int RedeemLoyaltyPoints = 0) : ICommand<Guid>;
