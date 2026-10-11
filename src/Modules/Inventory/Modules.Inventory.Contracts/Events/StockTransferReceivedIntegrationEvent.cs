using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Inventory.Contracts.Events;

/// <summary>One lot moved by a stock transfer, at the cost it carried at the source branch.</summary>
public sealed record StockTransferReceivedLine(
    Guid MedicineId,
    string BatchNo,
    decimal Quantity,
    decimal UnitCostPrice);

/// <summary>
/// Raised (Outbox, in the receive transaction) when a branch-to-branch stock transfer is received:
/// the stock now sits at <see cref="ToBranchId"/> instead of <see cref="FromBranchId"/>. Accounting
/// moves <see cref="TotalCost"/> of Inventory between the two branches. Nothing is posted at dispatch
/// or on cancel: until it is received the stock is still the source branch's, and a cancelled
/// transfer never left it.
/// </summary>
public sealed record StockTransferReceivedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid StockTransferId,
    string TransferNumber,
    Guid FromBranchId,
    Guid ToBranchId,
    decimal TotalCost,
    IReadOnlyList<StockTransferReceivedLine> Lines,
    DateTime ReceivedOnUtc)
    : IIntegrationEvent;
