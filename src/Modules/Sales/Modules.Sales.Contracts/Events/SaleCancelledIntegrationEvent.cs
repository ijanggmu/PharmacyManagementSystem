using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Sales.Contracts.Events;

/// <summary>One previously-sold line being reversed — carries the same quantity/cost the sale
/// recorded, since Sales never persisted the original FEFO batch allocation (only the weighted
/// average cost).</summary>
/// <summary><paramref name="BatchId"/> is the lot the line was sold from, so the restock goes back into it.
/// Null for lines sold before sales tracked batches.</summary>
public sealed record SaleCancelledLine(Guid MedicineId, decimal Quantity, decimal UnitCostPrice, Guid? BatchId = null);

/// <summary>
/// Raised right after a <c>Sale</c> is marked cancelled. Consumed by <c>Accounting</c> (voids the
/// voucher posted for this sale, if any) and <c>Inventory</c> (restocks). Replaces the previous
/// in-process calls to <c>IVoucherPostingService</c>/<c>IStockDeductionService</c> made from
/// <c>CancelSaleCommandHandler</c> after its own <c>SaveChangesAsync</c> — see
/// docs/pharmacy-modules-plan.md §2.
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
    Guid? BranchId = null)
    : IIntegrationEvent;
