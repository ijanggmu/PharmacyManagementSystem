using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Suppliers.Domain;

public enum ExpiryClaimStatus
{
    /// <summary>Being prepared; lots can still change.</summary>
    Draft = 0,

    /// <summary>Claim letter sent to the supplier; awaiting their answer.</summary>
    Sent = 1,

    /// <summary>Supplier accepted all or part of it; the goods went back on a debit note (SupplierReturn).</summary>
    Accepted = 2,

    /// <summary>Supplier's credit note received for the accepted goods. Final.</summary>
    Credited = 3,

    /// <summary>Supplier refused the claim; stock untouched. Final.</summary>
    Rejected = 4,
}

/// <summary>
/// A claim to a supplier for near-expiry / expired lots they delivered. It moves no stock and no money by
/// itself: when the supplier accepts (all or part), the accepted quantities go back on a normal supplier
/// return — debit note, stock deduction, AP credit, GL posting — with reason "Expiry", and the claim keeps
/// the link (<see cref="SupplierReturnId"/>). Lines are a nav collection (ValueGeneratedNever in config).
/// </summary>
public sealed class ExpiryClaim : AggregateRoot<Guid>
{
    public const string ReturnReason = "Expiry";

    private readonly List<ExpiryClaimLine> _lines = [];

    public string ClaimNumber { get; private set; } = default!;
    public Guid SupplierId { get; private set; }

    /// <summary>The branch whose stock is claimed — the return is deducted from this branch's lots.</summary>
    public Guid? BranchId { get; private set; }
    public ExpiryClaimStatus Status { get; private set; }
    public string? Notes { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? SentAtUtc { get; private set; }
    public DateTime? RespondedAtUtc { get; private set; }
    public DateTime? CreditedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    /// <summary>The debit note the accepted goods went back on.</summary>
    public Guid? SupplierReturnId { get; private set; }
    public string? DebitNoteNumber { get; private set; }

    /// <summary>The supplier's credit note number, recorded when marked credited.</summary>
    public string? SupplierCreditNoteNumber { get; private set; }
    public string? RejectionReason { get; private set; }

    public IReadOnlyList<ExpiryClaimLine> Lines => _lines;

    public decimal ClaimedValue => _lines.Sum(l => l.Quantity * l.UnitCost);
    public decimal AcceptedValue => _lines.Sum(l => (l.AcceptedQuantity ?? 0m) * l.UnitCost);

    private ExpiryClaim() { }

    public static ExpiryClaim Create(Guid supplierId, Guid? branchId, string? notes, DateTime nowUtc)
    {
        var id = Guid.CreateVersion7();
        return new ExpiryClaim
        {
            Id = id,
            // Version-7 ids share their leading (time) digits, so the tail is the distinctive part.
            ClaimNumber = $"EC-{nowUtc:yyMMdd}-{id.ToString("N")[^6..].ToUpperInvariant()}",
            SupplierId = supplierId,
            BranchId = branchId,
            Status = ExpiryClaimStatus.Draft,
            Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(),
            CreatedAtUtc = nowUtc,
        };
    }

    public ExpiryClaimLine AddLine(
        Guid medicineId, string medicineName, Guid batchId, string batchNo, DateOnly expiryDate, decimal quantity, decimal unitCost)
    {
        EnsureStatus(ExpiryClaimStatus.Draft, "change its lots");
        if (_lines.Any(l => l.BatchId == batchId))
        {
            throw Conflict($"Batch {batchNo} is already on this claim.");
        }

        var line = ExpiryClaimLine.Create(Id, medicineId, medicineName, batchId, batchNo, expiryDate, quantity, unitCost);
        _lines.Add(line);
        return line;
    }

    public void MarkSent(DateTime nowUtc)
    {
        EnsureStatus(ExpiryClaimStatus.Draft, "send it");
        if (_lines.Count == 0)
        {
            throw Conflict("A claim needs at least one lot.");
        }

        Status = ExpiryClaimStatus.Sent;
        SentAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>
    /// Records the supplier's acceptance. <paramref name="acceptedByLine"/> gives the accepted quantity per line
    /// (0 .. claimed); lines left out are accepted in full. Partial acceptance is the norm: the supplier may
    /// take back only some lots, or fewer units than claimed. At least one unit must be accepted (a claim the
    /// supplier takes nothing of is rejected instead).
    /// </summary>
    public void Accept(IReadOnlyDictionary<Guid, decimal> acceptedByLine, DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(acceptedByLine);
        EnsureStatus(ExpiryClaimStatus.Sent, "accept it");

        var unknown = acceptedByLine.Keys.FirstOrDefault(id => _lines.All(l => l.Id != id));
        if (unknown != Guid.Empty)
        {
            throw new NotFoundException($"Line {unknown} is not on claim {ClaimNumber}.");
        }

        foreach (var line in _lines)
        {
            line.Accept(acceptedByLine.TryGetValue(line.Id, out decimal accepted) ? accepted : line.Quantity);
        }

        if (_lines.All(l => l.AcceptedQuantity == 0m))
        {
            throw Conflict("Nothing was accepted. Reject the claim instead.");
        }

        Status = ExpiryClaimStatus.Accepted;
        RespondedAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    public void LinkReturn(Guid supplierReturnId, string? debitNoteNumber)
    {
        SupplierReturnId = supplierReturnId;
        DebitNoteNumber = debitNoteNumber;
    }

    public void Reject(string reason, DateTime nowUtc)
    {
        if (Status is not (ExpiryClaimStatus.Draft or ExpiryClaimStatus.Sent))
        {
            throw Conflict($"Claim {ClaimNumber} is {Status}; only a draft or sent claim can be rejected.");
        }

        Status = ExpiryClaimStatus.Rejected;
        RejectionReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        RespondedAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    public void MarkCredited(string? creditNoteNumber, DateTime nowUtc)
    {
        EnsureStatus(ExpiryClaimStatus.Accepted, "mark it credited");
        Status = ExpiryClaimStatus.Credited;
        SupplierCreditNoteNumber = string.IsNullOrWhiteSpace(creditNoteNumber) ? null : creditNoteNumber.Trim();
        CreditedAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>Whether the claim still holds its lots (they can't be claimed again meanwhile).</summary>
    public static bool IsOpen(ExpiryClaimStatus status) => status is ExpiryClaimStatus.Draft or ExpiryClaimStatus.Sent;

    private void EnsureStatus(ExpiryClaimStatus expected, string action)
    {
        if (Status != expected)
        {
            throw Conflict($"Claim {ClaimNumber} is {Status}; it must be {expected} to {action}.");
        }
    }

    private static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
}
