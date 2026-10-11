using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Inventory.Contracts.Events;

/// <summary>
/// Raised (Outbox) when stock is added without a supplier — opening stock entered through a
/// medicine create, a bulk import, or an edit that receives a new lot. Nothing is owed to anyone,
/// so Accounting posts Dr Inventory / Cr Owner's Equity for <see cref="Amount"/> (quantity x unit
/// cost), the same opening-balance entry the onboarding migration posts. Stock that arrives with a
/// supplier goes through <see cref="MedicineStockReceivedFromSupplierIntegrationEvent"/> instead.
/// </summary>
public sealed record OpeningStockReceivedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid ReceiptId,
    decimal Amount,
    DateTime ReceivedOnUtc,
    string Narration,
    Guid? BranchId = null)
    : IIntegrationEvent;
