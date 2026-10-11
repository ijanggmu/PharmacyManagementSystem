using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Suppliers.Domain;

/// <summary>
/// One returned line, for a specific medicine. Reached ONLY through <see cref="SupplierReturn"/>'s
/// navigation collection — needs <c>ValueGeneratedNever()</c> in its EF config (database.md nav-child
/// footgun, same as <c>SaleReturnItem</c>/<c>PurchaseOrderLine</c>).
/// </summary>
public sealed class SupplierReturnItem : BaseEntity<Guid>
{
    public Guid SupplierReturnId { get; private set; }
    public Guid MedicineId { get; private set; }
    public decimal Quantity { get; private set; }
    public decimal UnitCost { get; private set; }
    public string ReturnReason { get; private set; } = default!;
    public string? Notes { get; private set; }

    /// <summary>Medicine name when returned, so the debit note reads the same later.</summary>
    public string? MedicineName { get; private set; }

    /// <summary>Lot the goods came out of (recorded from the stock deduction).</summary>
    public Guid? BatchId { get; private set; }
    public string? BatchNo { get; private set; }

    /// <summary>Input VAT on this line, reversed with the return.</summary>
    public decimal VatAmount { get; private set; }

    public decimal TotalCost => Quantity * UnitCost;

    internal void RecordBatch(Guid batchId, string batchNo)
    {
        BatchId = batchId;
        BatchNo = batchNo;
    }

    private SupplierReturnItem() { }

    internal static SupplierReturnItem Create(
        Guid medicineId, decimal quantity, decimal unitCost, string returnReason, string? notes,
        string? medicineName = null, decimal vatAmount = 0m)
    {
        if (vatAmount < 0)
        {
            throw new CustomException("VAT cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (quantity <= 0)
        {
            throw new CustomException("Quantity must be positive.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (unitCost < 0)
        {
            throw new CustomException("Unit cost cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        return new SupplierReturnItem
        {
            Id = Guid.CreateVersion7(),
            MedicineId = medicineId,
            Quantity = quantity,
            UnitCost = unitCost,
            ReturnReason = string.IsNullOrWhiteSpace(returnReason) ? "Not specified" : returnReason.Trim(),
            Notes = notes?.Trim(),
            MedicineName = string.IsNullOrWhiteSpace(medicineName) ? null : medicineName.Trim(),
            VatAmount = vatAmount,
        };
    }

    internal void AssignReturn(Guid supplierReturnId) => SupplierReturnId = supplierReturnId;
}
