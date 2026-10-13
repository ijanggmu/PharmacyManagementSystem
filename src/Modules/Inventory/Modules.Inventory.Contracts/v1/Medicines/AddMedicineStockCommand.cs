using FSH.Modules.Inventory.Contracts.Events;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// Receives a new batch of an existing medicine with the same semantics as the opening stock on
/// <see cref="CreateMedicineCommand"/>: with a supplier it is a purchase (direct goods receipt +
/// payable, optionally paid now), without one it is opening stock valued into equity. Used when the
/// create form finds the medicine already exists ("add as new batch to existing").
/// Returns the batch id the stock went into.
/// </summary>
public sealed record AddMedicineStockCommand(
    Guid MedicineId,
    decimal Quantity,
    string? BatchNumber = null,
    DateOnly? ExpiryDate = null,
    string? RackLocation = null,
    decimal? CostPrice = null,
    decimal? SellingPrice = null,
    Guid? SupplierId = null,
    string? SupplierInvoiceNumber = null,
    decimal? VatAmount = null,
    SupplierBillPayment? Payment = null,
    // Without a supplier: how the stock was paid for (StockFundingSources: "opening_stock" — the default
    // when omitted — "cash" or "bank"). Cash/bank can't be combined with a supplier (use Payment instead).
    string? StockFunding = null) : ICommand<Guid>;
