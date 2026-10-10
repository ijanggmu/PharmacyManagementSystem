using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Sales.Contracts.Events;

/// <summary>One returned line to restock, carrying the same quantity/cost the return recorded (from
/// the original sale line) — Inventory restocks into a NEW batch dated today, same as
/// <c>SaleCancelledLine</c>, rather than undoing the original batch.</summary>
public sealed record ReturnCompletedLine(Guid MedicineId, decimal Quantity, decimal UnitCostPrice);

/// <summary>
/// Raised the first time a <c>SaleReturn</c> transitions into <c>ReturnStatus.Completed</c>. Consumed
/// by <c>Inventory</c> (restocks each line) and <c>Accounting</c> (posts the reversing voucher: Dr
/// Sales Returns &amp; Allowances / Cr Cash for <paramref name="TotalReturnAmount"/>, plus Dr Inventory
/// / Cr COGS for the returned quantity's cost — mirrors scripts/80-medicine-returns-accounting.sql).
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
    IReadOnlyList<ReturnCompletedLine> Lines)
    : IIntegrationEvent;
