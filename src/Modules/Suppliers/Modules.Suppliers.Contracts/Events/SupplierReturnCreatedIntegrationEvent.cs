using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Suppliers.Contracts.Events;

/// <summary>
/// Raised right after a supplier return's AP ledger credit and Inventory stock deduction are both
/// committed. Consumed by <c>Accounting</c> (posts the reversing voucher: Dr trade payables / Cr
/// inventory) — mirrors <c>accounting_post_purchase_return_voucher</c>
/// (scripts/65-accounting-module-completion.sql). Same "async off the Outbox, not an in-process
/// call" shape as <see cref="SupplierPaymentRecordedIntegrationEvent"/>.
/// </summary>
public sealed record SupplierReturnCreatedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid SupplierReturnId,
    Guid SupplierId,
    decimal TotalCost,
    // Branch the goods left from. Optional so events already queued still deserialize.
    Guid? BranchId = null,
    DateTime? ReturnDateUtc = null,
    // Input VAT reversed with the return; the payable drops by TotalCost + VatAmount.
    decimal VatAmount = 0m,
    string? DocumentNumber = null)
    : IIntegrationEvent;
