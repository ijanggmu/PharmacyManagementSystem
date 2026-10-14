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
/// <c>Sales.OverrideCreditLimit</c>, or one of <paramref name="ApprovalTokens"/> is a manager approval for it
/// (403 <c>approval_required</c> otherwise).
///
/// Discount caps: line and bill discounts above the caller's per-role cap (tenant setting
/// <c>controls.discount_caps</c>) need a manager approval token too. Approvals for a new sale are bound to its
/// <paramref name="ClientRequestId"/> (the checkout's Idempotency-Key), so the client keeps the key when it
/// resubmits with the token.
///
/// Loyalty: <paramref name="RedeemLoyaltyPoints"/> spends the member's points as a discount. The
/// client applies their value (points × the programme's point value) as line discounts; the server
/// checks the programme is on, the customer is a member with enough points, and that the sale's
/// discounts cover the value, then records the redemption (the Customers module deducts the points).
///
/// Idempotency: <paramref name="ClientRequestId"/> (filled from the request's <c>Idempotency-Key</c> header
/// when not sent in the body) is stored on the sale, unique per tenant. Replaying the same key — a timed-out
/// request retried, or an offline sale synced again — returns the id of the sale already recorded for it
/// instead of creating a second sale, even when the first request is still in flight.
///
/// Buyer: <paramref name="BuyerName"/> / <paramref name="BuyerPan"/> are printed on the tax invoice and reported to
/// IRD. Without a buyer PAN a sale up to the tenant's abbreviated-invoice threshold is an Abbreviated Tax Invoice;
/// above it IRD expects the buyer's name (and PAN when registered) — the POS warns, the server does not refuse
/// (an offline-replayed sale could never be corrected).
///
/// Cash drawer: a sale with a cash payment needs an open cash shift at the branch (409 <c>cash_shift_required</c>)
/// unless the tenant turned <c>controls.require_open_shift</c> off, or <paramref name="OfflineReplay"/> is set.
///
/// Price level: lines are priced at the customer's assigned price level (wholesale / custom), or at the lot price
/// (retail) when the customer has none — always by the server. <paramref name="PriceLevelId"/> is the level the till
/// priced at: omitted = the customer's own level. A different level that comes out cheaper than the customer's own
/// (e.g. wholesale for a walk-in) needs <c>Sales.OverridePriceLevel</c> or a manager approval (403
/// <c>approval_required</c>).
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
    int RedeemLoyaltyPoints = 0,
    string? ClientRequestId = null,
    string? BuyerName = null,
    string? BuyerPan = null,
    IReadOnlyList<string>? ApprovalTokens = null,
    Guid? PriceLevelId = null,
    // The cashier ticked "SMS receipt": text the bill number and total to SmsReceiptPhone (or, when blank, the
    // customer's phone) once the sale commits. Sent by the SMS feature (Notifications) off SaleCompletedIntegrationEvent.
    bool SmsReceipt = false,
    string? SmsReceiptPhone = null,
    // Set by the POS offline queue when it replays a sale rung up while the till was offline. Such a sale skips the
    // open-cash-shift check: the customer has already paid and left, so refusing it now would lose the sale.
    bool OfflineReplay = false) : ICommand<Guid>;
