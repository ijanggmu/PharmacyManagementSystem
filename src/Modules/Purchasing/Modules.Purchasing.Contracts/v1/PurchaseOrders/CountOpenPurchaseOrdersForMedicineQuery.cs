using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// Cross-module query: how many open purchase orders (draft or approved — not yet received or cancelled), across all
/// branches, have a line for <paramref name="MedicineId"/>. Inventory asks before archiving a medicine, since an order
/// for an archived medicine could no longer be received. No HTTP endpoint.
/// </summary>
public sealed record CountOpenPurchaseOrdersForMedicineQuery(Guid MedicineId) : IQuery<int>;
