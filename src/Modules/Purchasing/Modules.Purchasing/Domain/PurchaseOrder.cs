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
/// <see cref="ApplyReceivedQuantities"/>: the order is cut down to what arrived and closed as Received,
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

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? ApprovedAtUtc { get; private set; }
    public string? ApprovedBy { get; private set; }
    public DateTime? ReceivedAtUtc { get; private set; }
    public string? ReceivedBy { get; private set; }
    public DateTime? CancelledAtUtc { get; private set; }
    public string? CancelReason { get; private set; }

    public IReadOnlyList<PurchaseOrderLine> Lines => _lines;

    public decimal TotalAmount => _lines.Sum(l => l.Quantity * l.UnitCostPrice);

    /// <summary>Recoverable input VAT across all lines (net + VAT = gross payable to the supplier).</summary>
    public decimal TotalVatAmount => _lines.Sum(l => l.VatAmount);

    private PurchaseOrder() { }

    public static PurchaseOrder CreateDraft(
        Guid supplierId, DateTime orderDateUtc, string? narration, string? supplierInvoiceNumber = null, Guid? branchId = null)
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
        };
    }

    /// <summary>Backfill only: attributes a pre-branch order to a branch once.</summary>
    public void AssignLegacyBranch(Guid branchId)
    {
        BranchId ??= branchId;
    }

    public void AddLine(
        Guid medicineId, string? batchNo, DateOnly? expiryDate, decimal quantity,
        decimal unitCostPrice, decimal? sellingPrice, string? rackLocation, decimal vatAmount = 0m)
    {
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

        var line = PurchaseOrderLine.Create(
            medicineId, batchNo, expiryDate, quantity, unitCostPrice, sellingPrice, rackLocation, vatAmount);
        line.AssignOrder(Id);
        _lines.Add(line);
    }

    public void Approve(string approvedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(approvedBy);
        EnsureDraft();

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
    public IReadOnlyList<PurchaseOrderShortfall> ApplyReceivedQuantities(IReadOnlyDictionary<Guid, decimal> receivedByLine)
    {
        ArgumentNullException.ThrowIfNull(receivedByLine);
        EnsureApproved();

        var unknown = receivedByLine.Keys.Where(id => _lines.All(l => l.Id != id)).ToList();
        if (unknown.Count > 0)
        {
            throw new CustomException(
                $"Line {unknown[0]} does not belong to this purchase order.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        var shortfalls = new List<PurchaseOrderShortfall>();
        foreach (var line in _lines.ToList())
        {
            if (!receivedByLine.TryGetValue(line.Id, out decimal received) || received == line.Quantity)
            {
                continue;
            }

            if (received < 0m || received > line.Quantity)
            {
                throw new CustomException(
                    $"Received quantity for medicine {line.MedicineId} must be between 0 and the ordered {line.Quantity}.",
                    (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            shortfalls.Add(line.ReduceTo(received));
            if (received == 0m)
            {
                _lines.Remove(line);
            }
        }

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
        PurchaseOrder source, IReadOnlyList<PurchaseOrderShortfall> shortfalls, DateTime orderDateUtc)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(shortfalls);
        if (shortfalls.Count == 0)
        {
            throw new ArgumentException("A backorder needs at least one shortfall line.", nameof(shortfalls));
        }

        var backorder = CreateDraft(
            source.SupplierId, orderDateUtc, $"Backorder of purchase order {source.Id}: balance not delivered.",
            branchId: source.BranchId);
        foreach (var s in shortfalls)
        {
            backorder.AddLine(s.MedicineId, null, null, s.Quantity, s.UnitCostPrice, s.SellingPrice, s.RackLocation, s.VatAmount);
        }

        return backorder;
    }

    /// <summary>Notes a short receipt on the narration (kept within the 1024-character column).</summary>
    public void NoteShortReceipt(int shortLineCount, Guid? backorderId)
    {
        string note = backorderId is { } id
            ? $"[Received short on {shortLineCount} line(s); balance moved to backorder {id}.]"
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
