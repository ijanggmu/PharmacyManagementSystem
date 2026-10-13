using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// Creates a draft order. <see cref="BillDiscountPercent"/>/<see cref="BillDiscountAmount"/> is the bill-level
/// (cash/trade) discount — a positive amount wins over the percent — spread over the lines in proportion to their
/// value after line discounts.
/// </summary>
public sealed record CreatePurchaseOrderCommand(
    Guid SupplierId,
    DateTime OrderDateUtc,
    string? Narration,
    IReadOnlyList<PurchaseOrderLineInput> Lines,
    string? SupplierInvoiceNumber = null,
    decimal BillDiscountPercent = 0m,
    decimal BillDiscountAmount = 0m) : ICommand<Guid>;
