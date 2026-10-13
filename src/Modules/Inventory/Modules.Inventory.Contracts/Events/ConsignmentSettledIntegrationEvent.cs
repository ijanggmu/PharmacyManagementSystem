using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Inventory.Contracts.Events;

/// <summary>
/// Raised right after a consignment settlement is committed. Consumed by <c>Suppliers</c> (posts the
/// AP ledger entry) and <c>Accounting</c> (posts the AP voucher) — the same two-consumer pattern as
/// <c>PurchaseOrderReceivedIntegrationEvent</c>, since settling a consignment is economically the same
/// event as receiving a purchase order (the pharmacy now owes the supplier for stock it holds).
/// <see cref="TotalAmount"/> is net of VAT; the supplier is owed <see cref="TotalAmount"/> + <see cref="VatAmount"/>.
/// </summary>
public sealed record ConsignmentSettledIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid SettlementId,
    Guid SupplierId,
    decimal TotalAmount,
    DateTime SettlementDateUtc,
    // Branch the money moved at. Optional so events already queued in the outbox still deserialize
    // (Accounting then falls back to the tenant's default branch).
    Guid? BranchId = null,
    // Input VAT the supplier bills on the taxable lots settled. Defaults to 0 so events queued before it
    // existed still deserialize (and post as before, net only).
    decimal VatAmount = 0m)
    : IIntegrationEvent;
