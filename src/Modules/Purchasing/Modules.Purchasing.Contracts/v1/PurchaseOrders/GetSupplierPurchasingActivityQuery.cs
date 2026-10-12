using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// Cross-module query: whether Purchasing still has business with <paramref name="SupplierId"/>. Used by Suppliers'
/// DeleteSupplier to refuse deleting a supplier whose approved orders are still to arrive, or whose received
/// documents (purchase orders, direct goods receipts — received or voided) may still have AP postings in flight.
/// </summary>
public sealed record GetSupplierPurchasingActivityQuery(Guid SupplierId) : IQuery<SupplierPurchasingActivityDto>;

/// <param name="OpenPurchaseOrders">Approved purchase orders not yet received.</param>
/// <param name="ReceivedDocuments">Received purchase orders plus direct goods receipts (received or voided).</param>
public sealed record SupplierPurchasingActivityDto(int OpenPurchaseOrders, int ReceivedDocuments);
