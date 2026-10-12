using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Sales.Contracts.Events;

/// <summary>
/// One returned line, carrying the quantity/cost the return recorded (from the original sale line).
/// <paramref name="BatchId"/> is the lot the returned units were sold from, which Inventory restocks into (null for sales made before
/// sales tracked batches). <paramref name="Restock"/> is false for opened or damaged packs: they are not
/// put back on the shelf, and their cost stays in COGS as the loss.
/// </summary>
public sealed record ReturnCompletedLine(
    Guid MedicineId, decimal Quantity, decimal UnitCostPrice, Guid? BatchId = null, bool Restock = true);

/// <summary>
/// Raised the first time a <c>SaleReturn</c> transitions into <c>ReturnStatus.Completed</c>. Consumed
/// by <c>Inventory</c> (restocks each line marked <c>Restock</c>) and <c>Accounting</c> (Dr Inventory /
/// Cr COGS for the restocked quantity's cost). When <paramref name="MoneyRefundedSeparately"/> is true
/// the money goes back through the return's linked <c>SaleRefund</c> (credit note, VAT reversal) and
/// this event carries no cash posting. Events raised before that link existed (false) still post Dr
/// Sales Returns &amp; Allowances / Cr Cash for <paramref name="TotalReturnAmount"/> here.
/// Same "async off the Outbox, not an in-process call" shape as <c>SaleCancelledIntegrationEvent</c>.
/// </summary>
public sealed record ReturnCompletedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid ReturnId,
    Guid SaleId,
    Guid BranchId,
    decimal TotalReturnAmount,
    IReadOnlyList<ReturnCompletedLine> Lines,
    bool MoneyRefundedSeparately = false)
    : IIntegrationEvent;
