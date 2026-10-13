using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// Cross-module query: total quantity of <paramref name="MedicineId"/> ever actually received from
/// <paramref name="SupplierId"/> — every received purchase order plus every direct (non-PO) goods receipt
/// that has not been voided, free (bonus) units included — they went into stock too and can be returned. Used by Suppliers' CreateSupplierReturn to cap a return at "received minus
/// already returned" — mirrors the Next.js <c>getReceivedQuantity()</c> helper (supplier-return-service.ts),
/// which also unions the PO and direct/bulk-import receipt paths.
/// </summary>
public sealed record GetSupplierReceivedQuantityQuery(Guid SupplierId, Guid MedicineId) : IQuery<decimal>;
