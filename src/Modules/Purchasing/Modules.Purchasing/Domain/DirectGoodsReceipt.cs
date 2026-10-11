using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Purchasing.Domain;

public enum DirectGoodsReceiptStatus
{
    Received = 0,
    Voided = 1,
}

/// <summary>
/// A goods receipt posted WITHOUT a purchase order — stock received from a supplier via create/edit
/// medicine, bulk import, or a manual inventory receipt (domain-audit gap #1). Ports
/// <c>postDirectInventorySupplierReceipts</c> (lib/server/services/inventory-supplier-receipt-service.ts)
/// and scripts/61-direct-inventory-supplier-grn.sql's <c>goods_receipts.supplier_id</c> /
/// nullable-<c>purchase_order_id</c> shape — modeled here as its own aggregate rather than a nullable
/// FK on <see cref="PurchaseOrder"/>, since a direct receipt never has PO lines to reuse.
/// Received → Voided only; there is no draft stage (mirrors the TS service, which posts a receipt as
/// "received" in a single call, never leaving one in "draft").
/// </summary>
public sealed class DirectGoodsReceipt : AggregateRoot<Guid>
{
    private readonly List<DirectGoodsReceiptLine> _lines = [];

    public Guid SupplierId { get; private set; }
    public DateTime ReceiptDateUtc { get; private set; }
    public string? SupplierInvoiceNumber { get; private set; }
    public DirectGoodsReceiptStatus Status { get; private set; } = DirectGoodsReceiptStatus.Received;

    /// <summary>
    /// The branch this receipt was posted at — required, mirroring <c>goods_receipts.branch_id</c>
    /// (NOT NULL, scripts 36/42). Resolved by the command handler via
    /// <c>ICurrentBranch.RequireBranchIdAsync()</c>, never left unset: a goods receipt, like a sale
    /// or inventory transaction, is always attributed to exactly one branch
    /// (docs/branch-scoping-plan.md §2). Each line inherits this same value (mirrors
    /// <c>goods_receipt_items.branch_id</c>, backfilled from its parent receipt in script 42).
    /// </summary>
    public Guid BranchId { get; private set; }

    /// <summary>Our own serial number, e.g. <c>GRN-MAIN-2083/84-00001</c>: per branch, restarting each
    /// Nepali fiscal year. Null only on receipts created before numbering existed and not yet backfilled.</summary>
    public string? ReceiptNumber { get; private set; }

    /// <summary>BS year the receipt's fiscal year started in (2083 for FY 2083/84).</summary>
    public int? FiscalYear { get; private set; }

    public string CreatedBy { get; private set; } = default!;
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? VoidedAtUtc { get; private set; }
    public string? VoidedBy { get; private set; }
    public string? VoidReason { get; private set; }

    public IReadOnlyList<DirectGoodsReceiptLine> Lines => _lines;

    public decimal NetAmount => _lines.Sum(l => l.NetAmount);
    public decimal VatAmount => _lines.Sum(l => l.VatAmount);
    public decimal GrossAmount => NetAmount + VatAmount;

    private DirectGoodsReceipt() { }

    public static DirectGoodsReceipt Create(
        Guid supplierId, DateTime receiptDateUtc, string? supplierInvoiceNumber, string createdBy, Guid branchId,
        Guid? id = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(createdBy);

        return new DirectGoodsReceipt
        {
            // A caller-supplied id makes a receipt recorded from an integration event idempotent.
            Id = id ?? Guid.CreateVersion7(),
            SupplierId = supplierId,
            ReceiptDateUtc = receiptDateUtc,
            SupplierInvoiceNumber = string.IsNullOrWhiteSpace(supplierInvoiceNumber) ? null : supplierInvoiceNumber.Trim(),
            Status = DirectGoodsReceiptStatus.Received,
            CreatedBy = createdBy,
            CreatedAtUtc = DateTime.UtcNow,
            BranchId = branchId,
        };
    }

    /// <summary>Quantity/cost/VAT must be non-negative and the line must carry a positive quantity —
    /// mirrors the per-line guards in <c>postDirectInventorySupplierReceipts</c> (invalid VAT/unit
    /// cost throws there too). Unlike the TS service, a zero-quantity or zero-value line is rejected
    /// here rather than silently skipped; the command handler does that filtering BEFORE calling this,
    /// so by the time a line reaches the aggregate it is expected to be postable.</summary>
    public void AddLine(Guid medicineId, decimal quantity, decimal unitCostPrice, decimal vatAmount)
    {
        if (quantity <= 0)
        {
            throw new CustomException("Line quantity must be positive.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (unitCostPrice < 0)
        {
            throw new CustomException("Unit cost cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (vatAmount < 0)
        {
            throw new CustomException("VAT amount cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        var line = DirectGoodsReceiptLine.Create(medicineId, quantity, unitCostPrice, vatAmount);
        line.AssignReceipt(Id, BranchId);
        _lines.Add(line);
    }

    /// <summary>Records the Inventory lot each line's stock went into, in line order (the order the lines
    /// were sent to Inventory).</summary>
    public void RecordLots(IReadOnlyList<(Guid MedicineId, Guid BatchId, string BatchNo)> lots)
    {
        ArgumentNullException.ThrowIfNull(lots);

        if (lots.Count != _lines.Count)
        {
            throw new InvalidOperationException(
                $"Receipt {Id} has {_lines.Count} lines but {lots.Count} received lots were reported.");
        }

        for (int i = 0; i < _lines.Count; i++)
        {
            if (lots[i].MedicineId != _lines[i].MedicineId)
            {
                throw new InvalidOperationException($"Received lot {i} does not match line {i} of receipt {Id}.");
            }

            _lines[i].RecordLot(lots[i].BatchId, lots[i].BatchNo);
        }
    }

    /// <summary>Stamps the serial number once; a receipt is never renumbered.</summary>
    public void AssignNumber(string receiptNumber, int fiscalYear)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(receiptNumber);

        if (ReceiptNumber is not null)
        {
            throw new InvalidOperationException($"Receipt {Id} is already numbered {ReceiptNumber}.");
        }

        ReceiptNumber = receiptNumber;
        FiscalYear = fiscalYear;
    }

    /// <summary>
    /// Reverses this receipt (bad delivery, wrong entry, etc.) — ports <c>voidGoodsReceipt</c>'s
    /// status guard (lib/server/services/supplier-return-service.ts): only a currently-Received
    /// receipt can be voided, so a second void attempt, or one on a receipt that was never received,
    /// fails loudly instead of double-reversing stock/AP. Stock and AP/GL reversal are the CALLER's
    /// responsibility (synchronous stock deduction pre-commit, then an integration event for
    /// Suppliers/Accounting) — this method only flips the status once those have succeeded.
    /// </summary>
    public void Void(string voidedBy, string reason)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(voidedBy);
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);

        if (Status != DirectGoodsReceiptStatus.Received)
        {
            throw new CustomException(
                $"Only a received direct goods receipt can be voided (current status: {Status}).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Status = DirectGoodsReceiptStatus.Voided;
        VoidedAtUtc = DateTime.UtcNow;
        VoidedBy = voidedBy;
        VoidReason = reason.Trim();
    }
}
