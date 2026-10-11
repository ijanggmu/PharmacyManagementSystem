using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

public sealed record CreatePurchaseOrderCommand(
    Guid SupplierId,
    DateTime OrderDateUtc,
    string? Narration,
    IReadOnlyList<PurchaseOrderLineInput> Lines,
    string? SupplierInvoiceNumber = null) : ICommand<Guid>;
