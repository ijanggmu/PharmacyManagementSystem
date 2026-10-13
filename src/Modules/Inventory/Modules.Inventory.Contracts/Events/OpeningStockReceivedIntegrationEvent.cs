using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Inventory.Contracts.Events;

/// <summary>
/// Raised (Outbox) when stock is added without a supplier — through a medicine create, add stock, a
/// manual batch, a bulk import, or an edit that receives a new lot. Nothing is owed to anyone, so
/// Accounting debits Inventory for <see cref="Amount"/> (quantity x unit cost) and credits the account
/// <see cref="Funding"/> names (see <see cref="StockFundingSources"/>): Owner's Equity for opening stock
/// (the default — null, as on events raised before funding was carried, means opening stock), Cash or
/// Bank for stock bought and paid for without a supplier bill. Stock that arrives with a supplier goes
/// through <see cref="MedicineStockReceivedFromSupplierIntegrationEvent"/> instead.
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
    Guid? BranchId = null,
    string? Funding = null)
    : IIntegrationEvent;
