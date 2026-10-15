using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Purchasing.Domain;

public enum PurchaseOrderStatus
{
    Draft = 0,
    Approved = 1,
    Received = 2,
    Cancelled = 3,
}

/// <summary>
/// Draft → Approved → Received | Cancelled. One order is received once (one stock receipt, one AP ledger
/// entry, one GL voucher keyed by the order id). A short delivery is handled by
/// <see cref="ApplyReceivedQuantities(IReadOnlyDictionary{Guid, decimal})"/>: the order is cut down to what arrived and closed as Received,
/// and the undelivered balance can be carried to a new draft backorder (<see cref="CreateBackorder"/>).
/// </summary>
public sealed class PurchaseOrder : AggregateRoot<Guid>
{
    public const int MaxNarrationLength = 1024;

    private readonly List<PurchaseOrderLine> _lines = [];

    public Guid SupplierId { get; private set; }
    public DateTime OrderDateUtc { get; private set; }
    public PurchaseOrderStatus Status { get; private set; } = PurchaseOrderStatus.Draft;
    public string? Narration { get; private set; }
    public string? SupplierInvoiceNumber { get; private set; }

    /// <summary>The branch that ordered and receives the goods. Null only on orders raised before
    /// orders carried a branch (backfilled to the tenant's default branch at seed time).</summary>
    public Guid? BranchId { get; private set; }

    /// <summary>Our own serial number, e.g. <c>PO-MAIN-2083/84-00001</c>: per branch, restarting each Nepali fiscal
    /// year. Null on orders raised before orders were numbered.</summary>
    public string? OrderNumber { get; private set; }

    /// <summary>BS year the order's fiscal year started in (2083 for FY 2083/84); null alongside <see cref="OrderNumber"/>.</summary>
    public int? FiscalYear { get; private set; }

    /// <summary>Id of the user who raised the order (null on orders raised before it was recorded). With the
    /// second-approver control on, that user can't approve it.</summary>
    public string? CreatedBy { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? ApprovedAtUtc { get; private set; }
    public string? ApprovedBy { get; private set; }
    public DateTime? ReceivedAtUtc { get; private set; }
    public string? ReceivedBy { get; private set; }
    public DateTime? CancelledAtUtc { get; private set; }
    public string? CancelReason { get; private set; }

    public IReadOnlyList<PurchaseOrderLine> Lines => _lines;

    /// <summary>Bill-level (cash/trade) discount percent as entered; informational when an amount was entered.</summary>
    public decimal BillDiscountPercent { get; private set; }

    /// <summary>Bill-level (cash/trade) discount, spread over the lines (<see cref="PurchaseOrderLine.BillDiscountAmount"/>).</summary>
    public decimal BillDiscountAmount { get; private set; }

    /// <summary>Σ quantity × rate, before any discount.</summary>
    public decimal SubtotalAmount => _lines.Sum(l => l.GrossAmount);

    /// <summary>Σ line trade discounts (the bill discount is <see cref="BillDiscountAmount"/>).</summary>
    public decimal LineDiscountAmount => _lines.Sum(l => l.DiscountAmount);

    /// <summary>Taxable (net) value of the order: subtotal less line and bill discounts. Net + VAT is the payable.</summary>
    public decimal TotalAmount => _lines.Sum(l => l.NetAmount);

    /// <summary>Recoverable input VAT across all lines (net + VAT = gross payable to the supplier).</summary>
    public decimal TotalVatAmount => _lines.Sum(l => l.VatAmount);

    private PurchaseOrder() { }

    public static PurchaseOrder CreateDraft(
        Guid supplierId, DateTime orderDateUtc, string? narration, string? supplierInvoiceNumber = null, Guid? branchId = null,
        string? createdBy = null)
    {
        return new PurchaseOrder
        {
            Id = Guid.CreateVersion7(),
            SupplierId = supplierId,
            OrderDateUtc = orderDateUtc,
            Narration = narration?.Trim(),
            SupplierInvoiceNumber = string.IsNullOrWhiteSpace(supplierInvoiceNumber) ? null : supplierInvoiceNumber.Trim(),
            Status = PurchaseOrderStatus.Draft,
            CreatedAtUtc = DateTime.UtcNow,
            BranchId = branchId,
            CreatedBy = string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim(),
        };
    }

    /// <summary>Stamps the serial number once; an order is never renumbered.</summary>
    public void AssignNumber(string orderNumber, int fiscalYear)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(orderNumber);

        if (OrderNumber is not null)
        {
            throw new InvalidOperationException($"Purchase order {Id} is already numbered {OrderNumber}.");
        }

        OrderNumber = orderNumber;
        FiscalYear = fiscalYear;
    }

    /// <summary>How the order is named to people: its number, or its id when it has none.</summary>
    public string DisplayNumber => OrderNumber ?? Id.ToString();

    /// <summary>Backfill only: attributes a pre-branch order to a branch once.</summary>
    public void AssignLegacyBranch(Guid branchId)
    {
        BranchId ??= branchId;
    }

    /// <summary>Adds a line (quantities in base units; <paramref name="terms"/> carries the free quantity, trade
    /// discount and pack). Adding a line re-spreads the bill discount over every line.</summary>
    public void AddLine(
        Guid medicineId, string? batchNo, DateOnly? expiryDate, decimal quantity,
        decimal unitCostPrice, decimal? sellingPrice, string? rackLocation, decimal vatAmount = 0m,
        PurchaseLineTerms? terms = null)
    {
        terms ??= PurchaseLineTerms.None;
        EnsureDraft();

        if (quantity <= 0)
        {
            throw new CustomException(
                "Line quantity must be positive.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (vatAmount < 0)
        {
            throw new CustomException(
                "Line VAT amount cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (unitCostPrice < 0)
        {
            throw new CustomException(
                "Unit cost cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        decimal gross = PurchaseLineMath.Gross(quantity, unitCostPrice, terms.PackSize, terms.PackUnitCost);
        decimal discount = PurchaseLineMath.ValidateTerms(gross, terms);

        var line = PurchaseOrderLine.Create(
            medicineId, batchNo, expiryDate, quantity, unitCostPrice, sellingPrice, rackLocation, vatAmount, terms, discount);
        line.AssignOrder(Id);
        _lines.Add(line);
        AllocateBillDiscount();
    }

    /// <summary>
    /// Sets the bill-level (cash/trade) discount: a positive <paramref name="amount"/> as entered, otherwise
    /// <paramref name="percent"/> of the lines' discounted total — and spreads it over the lines in proportion to
    /// their discounted value (<see cref="PurchaseLineMath.Allocate"/>). Draft only; call after adding the lines.
    /// </summary>
    public void ApplyBillDiscount(decimal percent, decimal amount)
    {
        EnsureDraft();

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

    public void Approve(string approvedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(approvedBy);
        switch (Status)
        {
            case PurchaseOrderStatus.Approved:
                throw new CustomException(
                    $"Purchase order {DisplayNumber} is already approved.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            case PurchaseOrderStatus.Received:
                throw new CustomException(
                    $"Purchase order {DisplayNumber} has already been received.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            case PurchaseOrderStatus.Cancelled:
                throw new CustomException(
                    $"Purchase order {DisplayNumber} is cancelled and can't be approved.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (_lines.Count == 0)
        {
            throw new CustomException(
                "A purchase order must have at least one line before it can be approved.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Status = PurchaseOrderStatus.Approved;
        ApprovedAtUtc = DateTime.UtcNow;
        ApprovedBy = approvedBy;
    }

    /// <summary>
    /// Fills the batch number, expiry and selling price supplied at receipt for one line. Details the
    /// line already has are kept. Must be called while the order is still Approved.
    /// </summary>
    public void CaptureReceiptDetails(Guid lineId, string? batchNo, DateOnly? expiryDate, decimal? sellingPrice)
    {
        EnsureApproved();

        var line = _lines.FirstOrDefault(l => l.Id == lineId)
            ?? throw new CustomException(
                $"Line {lineId} does not belong to this purchase order.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);

        line.FillMissingDetails(batchNo, expiryDate, sellingPrice);
    }

    /// <summary>
    /// Records the supplier's bill number that came with the goods. Blank keeps the number entered on the order.
    /// Must be called while the order is still Approved.
    /// </summary>
    public void CaptureSupplierInvoiceNumber(string? supplierInvoiceNumber)
    {
        EnsureApproved();
        if (string.IsNullOrWhiteSpace(supplierInvoiceNumber)) return;
        SupplierInvoiceNumber = supplierInvoiceNumber.Trim();
    }

    /// <summary>
    /// Rejects the receipt when any line still lacks a batch number, expiry date or selling price.
    /// </summary>
    public void EnsureReceivable()
    {
        EnsureApproved();

        var problems = _lines
            .Select(l => (Line: l, Missing: l.MissingReceiptDetails()))
            .Where(x => x.Missing.Count > 0)
            .Select(x => $"Line for medicine {x.Line.MedicineId} is missing {string.Join(", ", x.Missing)}.")
            .ToList();

        if (problems.Count > 0)
        {
            throw new CustomException(
                "Batch details are required before this purchase order can be received.",
                problems, HttpStatusCode.BadRequest);
        }
    }

    /// <summary>
    /// Records a short delivery before <see cref="Receive"/>. <paramref name="receivedByLine"/> maps a line id
    /// to the quantity that arrived (0 up to the ordered quantity); lines not in the map arrive in full.
    /// Lines that arrived short are cut down to the delivered quantity, lines with nothing delivered are
    /// removed, and the undelivered balance is returned. At least one unit must arrive.
    /// </summary>
    public IReadOnlyList<PurchaseOrderShortfall> ApplyReceivedQuantities(IReadOnlyDictionary<Guid, decimal> receivedByLine) =>
        ApplyReceivedQuantities(receivedByLine, null);

    /// <summary>
    /// As <see cref="ApplyReceivedQuantities(IReadOnlyDictionary{Guid, decimal})"/>, also taking the free (bonus)
    /// quantity that arrived per line. A line missing from <paramref name="freeReceivedByLine"/> gets its free
    /// goods in proportion to the paid quantity delivered (rounded down to whole units). The line discount, VAT
    /// and bill-discount share of the undelivered part move to the shortfall, so the order's bill discount is
    /// what the delivered lines still carry.
    /// </summary>
    public IReadOnlyList<PurchaseOrderShortfall> ApplyReceivedQuantities(
        IReadOnlyDictionary<Guid, decimal> receivedByLine, IReadOnlyDictionary<Guid, decimal>? freeReceivedByLine)
    {
        ArgumentNullException.ThrowIfNull(receivedByLine);
        freeReceivedByLine ??= new Dictionary<Guid, decimal>();
        EnsureApproved();

        var unknown = receivedByLine.Keys.Concat(freeReceivedByLine.Keys).Where(id => _lines.All(l => l.Id != id)).ToList();
        if (unknown.Count > 0)
        {
            throw new CustomException(
                $"Line {unknown[0]} does not belong to this purchase order.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        var shortfalls = new List<PurchaseOrderShortfall>();
        foreach (var line in _lines.ToList())
        {
            decimal received = receivedByLine.TryGetValue(line.Id, out decimal paid) ? paid : line.Quantity;
            decimal? freeReceived = freeReceivedByLine.TryGetValue(line.Id, out decimal free) ? free : null;
            if (received == line.Quantity && (freeReceived is null || freeReceived == line.FreeQuantity))
            {
                continue;
            }

            if (received < 0m || received > line.Quantity)
            {
                throw new CustomException(
                    $"Received quantity for medicine {line.MedicineId} must be between 0 and the ordered {line.Quantity}.",
                    (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            shortfalls.Add(line.ReduceTo(received, received == 0m ? 0m : freeReceived));
            if (received == 0m)
            {
                _lines.Remove(line);
            }
        }

        BillDiscountAmount = _lines.Sum(l => l.BillDiscountAmount);

        if (_lines.Count == 0)
        {
            throw new CustomException(
                "Nothing was received. Cancel the purchase order instead.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        return shortfalls;
    }

    /// <summary>
    /// A new draft order, to the same supplier, for the balance a short receipt did not deliver. Batch
    /// number and expiry are left blank (the balance arrives as a new lot); selling price, rack location,
    /// unit cost and the undelivered share of VAT carry over.
    /// </summary>
    public static PurchaseOrder CreateBackorder(
        PurchaseOrder source, IReadOnlyList<PurchaseOrderShortfall> shortfalls, DateTime orderDateUtc, string? createdBy = null)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(shortfalls);
        if (shortfalls.Count == 0)
        {
            throw new ArgumentException("A backorder needs at least one shortfall line.", nameof(shortfalls));
        }

        var backorder = CreateDraft(
            source.SupplierId, orderDateUtc, $"Backorder of purchase order {source.DisplayNumber}: balance not delivered.",
            branchId: source.BranchId, createdBy: createdBy);

        // A line whose paid quantity all arrived but some free goods did not has nothing left to order: the
        // missing bonus units are not reordered.
        var reorder = shortfalls.Where(s => s.Quantity > 0m).ToList();
        foreach (var s in reorder)
        {
            backorder.AddLine(
                s.MedicineId, null, null, s.Quantity, s.UnitCostPrice, s.SellingPrice, s.RackLocation, s.VatAmount, s.Terms);
        }

        decimal billDiscount = reorder.Sum(s => s.BillDiscountAmount);
        if (billDiscount > 0m)
        {
            backorder.ApplyBillDiscount(source.BillDiscountPercent, billDiscount);
        }

        return backorder;
    }

    /// <summary>
    /// Segregation of duties (the <c>controls.po_second_approver</c> internal control): the user who raised the order
    /// can't approve it; someone else holding Approve must. Orders raised before the creator was recorded aren't blocked.
    /// </summary>
    public void EnsureApproverIsNotCreator(string approverUserId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(approverUserId);
        if (CreatedBy is not null && string.Equals(CreatedBy, approverUserId.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            throw new ForbiddenException(
                $"Purchase orders need a second approver: you raised {DisplayNumber}, so someone else with approval rights must approve it.");
        }
    }

    /// <summary>Notes a short receipt on the narration (kept within the 1024-character column).</summary>
    public void NoteShortReceipt(int shortLineCount, Guid? backorderId) =>
        NoteShortReceipt(shortLineCount, backorderId?.ToString());

    /// <summary>As <see cref="NoteShortReceipt(int, Guid?)"/>, naming the backorder by its number.</summary>
    public void NoteShortReceipt(int shortLineCount, string? backorderNumber)
    {
        string note = backorderNumber is not null
            ? $"[Received short on {shortLineCount} line(s); balance moved to backorder {backorderNumber}.]"
            : $"[Received short on {shortLineCount} line(s); balance not reordered.]";
        string combined = string.IsNullOrWhiteSpace(Narration) ? note : $"{Narration} {note}";
        Narration = combined.Length <= MaxNarrationLength ? combined : combined[..MaxNarrationLength];
    }

    public void Receive(string receivedBy, DateTime? receivedAtUtc = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(receivedBy);

        if (Status != PurchaseOrderStatus.Approved)
        {
            throw new CustomException(
                $"Only an approved purchase order can be received (current status: {Status}).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Status = PurchaseOrderStatus.Received;
        ReceivedAtUtc = receivedAtUtc ?? DateTime.UtcNow;
        ReceivedBy = receivedBy;
    }

    public void Cancel(string reason)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);

        if (Status is PurchaseOrderStatus.Received or PurchaseOrderStatus.Cancelled)
        {
            throw new CustomException(
                $"A {Status} purchase order cannot be cancelled.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Status = PurchaseOrderStatus.Cancelled;
        CancelledAtUtc = DateTime.UtcNow;
        CancelReason = reason.Trim();
    }

    private void EnsureApproved()
    {
        if (Status != PurchaseOrderStatus.Approved)
        {
            throw new CustomException(
                $"Only an approved purchase order can be received (current status: {Status}).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }

    private void EnsureDraft()
    {
        if (Status != PurchaseOrderStatus.Draft)
        {
            throw new CustomException(
                $"Purchase order is {Status} and can no longer be edited.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
