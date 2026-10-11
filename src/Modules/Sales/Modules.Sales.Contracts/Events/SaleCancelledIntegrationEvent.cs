using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Sales.Contracts.Events;

/// <summary>One previously-sold line being reversed — carries the same quantity/cost the sale
/// recorded, since Sales never persisted the original FEFO batch allocation (only the weighted
/// average cost).</summary>
public sealed record SaleCancelledLine(Guid MedicineId, decimal Quantity, decimal UnitCostPrice);

/// <summary>
/// Raised right after a <c>Sale</c> is marked cancelled. Consumed by <c>Accounting</c> (voids the
/// voucher posted for this sale, if any) and <c>Inventory</c> (restocks). Replaces the previous
/// in-process calls to <c>IVoucherPostingService</c>/<c>IStockDeductionService</c> made from
/// <c>CancelSaleCommandHandler</c> after its own <c>SaveChangesAsync</c> — see
/// docs/pharmacy-modules-plan.md §2. Also consumed by <c>Customers</c>: credits back the AR balance the
/// sale left on account (<see cref="OnAccountAmount"/>) and reverses the loyalty points earned / restores
/// the points redeemed on it. The trailing fields are optional so events already queued in the outbox
/// still deserialize (consumers then skip the work those fields drive).
/// </summary>
public sealed record SaleCancelledIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid SaleId,
    string Reason,
    IReadOnlyList<SaleCancelledLine> Lines,
    // The sale's branch, so Inventory restocks there: the outbox dispatcher that delivers this event has no
    // current branch. Null on events raised before it was added.
    Guid? BranchId = null,
    Guid? CustomerId = null,
    // What the sale left on the customer's account (its BalanceDue) — credited back on cancel.
    decimal OnAccountAmount = 0m,
    string? InvoiceNumber = null)
    : IIntegrationEvent;
