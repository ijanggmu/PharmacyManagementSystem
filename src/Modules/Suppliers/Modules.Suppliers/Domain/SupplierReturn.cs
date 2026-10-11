using FSH.Framework.Core.Domain;

namespace FSH.Modules.Suppliers.Domain;

/// <summary>
/// Goods physically handed back to a supplier — mirrors the Next.js <c>supplier_returns</c> /
/// <c>supplier_return_items</c> tables and <c>createSupplierReturnForTenant</c>
/// (lib/server/services/supplier-return-service.ts). The per-line "cannot return more than was
/// received (minus already returned)" cap — that source's "R5" domain-audit rule — needs sibling
/// <see cref="SupplierReturn"/> rows and a cross-module received-quantity lookup (Purchasing), so it
/// lives in <c>CreateSupplierReturnCommandHandler</c>, not on this aggregate.
///
/// Committing a return: credits the AP ledger locally (this module, synchronously — mirrors
/// <c>trg_supplier_returns_accounting</c> crediting the per-supplier subledger to match the GL
/// control account) and deducts on-hand stock synchronously via Inventory's
/// <c>IStockDeductionService</c> (same "must not commit a return whose stock deduction failed" shape
/// as <c>ReceivePurchaseOrderCommandHandler</c>'s synchronous receipt call), then fires
/// <c>SupplierReturnCreatedIntegrationEvent</c> for Accounting to post the reversing GL voucher
/// asynchronously off the Outbox — the same shape as <c>RecordSupplierPaymentCommandHandler</c>.
/// </summary>
public sealed class SupplierReturn : AggregateRoot<Guid>
{
    private readonly List<SupplierReturnItem> _items = [];

    public Guid SupplierId { get; private set; }
    public DateTime ReturnDateUtc { get; private set; }
    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// Nullable per docs/branch-scoping-plan.md §2 — ledger/reporting entities keep <c>BranchId</c>
    /// nullable (NULL = legacy/tenant-wide); sourced via <c>ICurrentBranch.GetBranchIdAsync()</c> in
    /// <c>CreateSupplierReturnCommandHandler</c>, persisting <c>null</c> when it returns <c>null</c>.
    /// </summary>
    public Guid? BranchId { get; private set; }

    /// <summary>Debit-note number, e.g. <c>DN-MAIN-2083/84-00012</c>: the document handed to the supplier.</summary>
    public string? DocumentNumber { get; private set; }

    /// <summary>Supplier's bill the goods came on, when known — quoted on the debit note.</summary>
    public string? SupplierInvoiceNumber { get; private set; }

    public IReadOnlyList<SupplierReturnItem> Items => _items;

    /// <summary>Authoritative total: the sum of each line's quantity x unit cost.</summary>
    public decimal TotalCost => _items.Sum(i => i.TotalCost);

    /// <summary>Input VAT reversed by this return (the VAT the supplier's bill charged on these goods).</summary>
    public decimal VatAmount => _items.Sum(i => i.VatAmount);

    /// <summary>What the supplier owes back / what the payable drops by: cost plus VAT.</summary>
    public decimal TotalAmount => TotalCost + VatAmount;

    public void AssignDocument(string documentNumber, string? supplierInvoiceNumber)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(documentNumber);
        DocumentNumber = documentNumber;
        SupplierInvoiceNumber = string.IsNullOrWhiteSpace(supplierInvoiceNumber) ? null : supplierInvoiceNumber.Trim();
    }

    private SupplierReturn() { }

    public static SupplierReturn Create(Guid supplierId, DateTime returnDateUtc, string? notes, Guid? branchId = null)
    {
        return new SupplierReturn
        {
            Id = Guid.CreateVersion7(),
            SupplierId = supplierId,
            ReturnDateUtc = returnDateUtc,
            Notes = notes?.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
            BranchId = branchId,
        };
    }

    /// <summary>Adds a return line. The "cannot exceed received-minus-already-returned" cap lives in
    /// the handler (this aggregate can't see sibling returns or Purchasing's receipt history).</summary>
    public SupplierReturnItem AddItem(
        Guid medicineId, decimal quantity, decimal unitCost, string returnReason, string? notes,
        string? medicineName = null, decimal vatAmount = 0m)
    {
        var item = SupplierReturnItem.Create(medicineId, quantity, unitCost, returnReason, notes, medicineName, vatAmount);
        item.AssignReturn(Id);
        _items.Add(item);
        return item;
    }
}
