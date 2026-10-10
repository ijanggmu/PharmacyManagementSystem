using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// Cross-module query: total quantity of <paramref name="MedicineId"/> ever actually received
/// (order status == Received) from <paramref name="SupplierId"/>, across every purchase order.
/// Used by Suppliers' CreateSupplierReturn to cap a return at "received minus already returned" —
/// mirrors the Next.js <c>getReceivedQuantity()</c> helper (supplier-return-service.ts). That source
/// also unions in a direct/bulk-import receipt path with no purchase order at all; this .NET port has
/// no such non-PO receiving flow yet, so only the PO -&gt; Received path is counted here.
/// </summary>
public sealed record GetSupplierReceivedQuantityQuery(Guid SupplierId, Guid MedicineId) : IQuery<decimal>;
