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
/// A goods receipt (GRN): one delivery from a supplier, booked as that supplier's bill. Every delivery gets one —
/// stock received straight off a bill (manual receipt, create/edit medicine, bulk import; ports
/// <c>postDirectInventorySupplierReceipts</c>) and, since receipts were unified, the delivery of a purchase order
/// (<see cref="PurchaseOrderId"/> set). The receipt carries what actually arrived — quantities, free goods, the
/// billed rate, batch and expiry — while the order only records what was asked for. Stock, the AP entry and the
/// GL voucher all hang off the receipt, so voiding it reverses one delivery the same way whatever its source.
/// Received → Voided only; there is no draft stage.
/// </summary>
public sealed class DirectGoodsReceipt : AggregateRoot<Guid>
{
    private readonly List<DirectGoodsReceiptLine> _lines = [];

    public Guid SupplierId { get; private set; }

    /// <summary>The purchase order this receipt delivered; null for a receipt booked without an order.</summary>
    public Guid? PurchaseOrderId { get; private set; }

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

    /// <summary>Bill-level (cash/trade) discount percent as entered; informational when an amount was entered.</summary>
    public decimal BillDiscountPercent { get; private set; }

    /// <summary>Bill-level (cash/trade) discount, spread over the lines (<see cref="DirectGoodsReceiptLine.BillDiscountAmount"/>).</summary>
    public decimal BillDiscountAmount { get; private set; }

    /// <summary>Σ quantity × rate, before any discount.</summary>
    public decimal SubtotalAmount => _lines.Sum(l => l.GrossAmount);

    /// <summary>Σ line trade discounts (the bill discount is <see cref="BillDiscountAmount"/>).</summary>
    public decimal LineDiscountAmount => _lines.Sum(l => l.DiscountAmount);

    /// <summary>Taxable value: subtotal less line and bill discounts.</summary>
    public decimal NetAmount => _lines.Sum(l => l.NetAmount);
    public decimal VatAmount => _lines.Sum(l => l.VatAmount);

    /// <summary>The supplier's bill: net + VAT (what is owed — the AP amount).</summary>
    public decimal GrossAmount => NetAmount + VatAmount;

    private DirectGoodsReceipt() { }

    public static DirectGoodsReceipt Create(
        Guid supplierId, DateTime receiptDateUtc, string? supplierInvoiceNumber, string createdBy, Guid branchId,
        Guid? id = null, Guid? purchaseOrderId = null)
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
            PurchaseOrderId = purchaseOrderId,
        };
    }

    /// <summary>Quantity/cost/VAT must be non-negative and the line must carry a positive quantity —
    /// mirrors the per-line guards in <c>postDirectInventorySupplierReceipts</c> (invalid VAT/unit
    /// cost throws there too). Unlike the TS service, a zero-quantity or zero-value line is rejected
    /// here rather than silently skipped; the command handler does that filtering BEFORE calling this,
    /// so by the time a line reaches the aggregate it is expected to be postable. <paramref name="terms"/>
    /// carries the free quantity, trade discount and pack the line was entered in (base units). Adding a line
    /// re-spreads the bill discount over every line.</summary>
    public void AddLine(Guid medicineId, decimal quantity, decimal unitCostPrice, decimal vatAmount, PurchaseLineTerms? terms = null)
    {
        terms ??= PurchaseLineTerms.None;

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

        decimal gross = PurchaseLineMath.Gross(quantity, unitCostPrice, terms.PackSize, terms.PackUnitCost);
        decimal discount = PurchaseLineMath.ValidateTerms(gross, terms);

        var line = DirectGoodsReceiptLine.Create(medicineId, quantity, unitCostPrice, vatAmount, terms, discount);
        line.AssignReceipt(Id, BranchId);
        _lines.Add(line);
        AllocateBillDiscount();
    }

    /// <summary>
    /// Sets the bill-level (cash/trade) discount: a positive <paramref name="amount"/> as entered, otherwise
    /// <paramref name="percent"/> of the lines' discounted total — and spreads it over the lines in proportion
    /// to their discounted value (<see cref="PurchaseLineMath.Allocate"/>). Call after the lines are added.
    /// </summary>
    public void ApplyBillDiscount(decimal percent, decimal amount)
    {
        decimal discountedTotal = _lines.Sum(l => l.DiscountedAmount);
        decimal resolved = PurchaseLineMath.BillDiscount(discountedTotal, percent, amount);
        PurchaseLineMath.ValidateBillDiscount(percent, resolved, discountedTotal);

        BillDiscountPercent = percent;
        BillDiscountAmount = resolved;
        AllocateBillDiscount();
    }

    private void AllocateBillDiscount()
    {
        var shares = PurchaseLineMath.Allocate(_lines.Select(l => l.DiscountedAmount).ToList(), BillDiscountAmount);
        for (int i = 0; i < _lines.Count; i++)
        {
            _lines[i].AssignBillDiscount(shares[i]);
        }
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
