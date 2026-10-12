using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// Cross-module query: the Inventory lots (batch ids) <paramref name="MedicineId"/> was received into from
/// <paramref name="SupplierId"/>, as recorded on non-voided direct goods receipts. Used by Suppliers'
/// CreateSupplierReturn to check that a debit note's pinned batch actually came from this supplier.
/// </summary>
public sealed record GetSupplierReceivedLotsQuery(Guid SupplierId, Guid MedicineId) : IQuery<SupplierReceivedLotsDto>;

/// <param name="BatchIds">Lots recorded on this supplier's receipts of the medicine.</param>
/// <param name="HasUntrackedReceipts">True when some of this supplier's receipts of the medicine don't record
/// their lot (purchase orders, and direct receipts from before lots were kept) — a lot outside
/// <paramref name="BatchIds"/> may still have come from this supplier, so callers can't reject it outright.</param>
public sealed record SupplierReceivedLotsDto(IReadOnlyList<Guid> BatchIds, bool HasUntrackedReceipts);
