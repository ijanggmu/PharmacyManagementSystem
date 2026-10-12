using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

public enum CashShiftStatus
{
    Open = 0,
    Closed = 1,
}

/// <summary>
/// A till/register session: opened with a starting cash float, closed with the cash actually
/// counted. <c>GetCashShiftSummaryQuery</c> compares the counted amount against
/// <c>OpeningFloat + cash sales during the shift window</c> to surface a variance — this entity only
/// tracks the shift's own lifecycle, not the reconciliation math.
/// </summary>
public sealed class CashShift : AggregateRoot<Guid>
{
    /// <summary>The branch this till session was opened at — required (branch-scoping-plan.md §2:
    /// mirrors <c>cash_register_shifts.branch_id NOT NULL</c>), resolved via
    /// <c>ICurrentBranch.RequireBranchIdAsync</c> in <c>StartCashShiftCommandHandler</c>.</summary>
    public Guid BranchId { get; private set; }

    public DateTime OpenedAtUtc { get; private set; }
    public string OpenedBy { get; private set; } = default!;
    public decimal OpeningFloat { get; private set; }
    public DateTime? ClosedAtUtc { get; private set; }
    public string? ClosedBy { get; private set; }
    public decimal? ClosingCashCounted { get; private set; }
    public CashShiftStatus Status { get; private set; } = CashShiftStatus.Open;
    public string? Notes { get; private set; }

    /// <summary>Notes entered when the shift was closed. Max 1000 characters.</summary>
    public string? ClosingNotes { get; private set; }

    /// <summary>The drawer reconciliation frozen at close (<see cref="Close"/>): later cancellations,
    /// returns or refunds of sales from this window no longer move a closed shift's expected cash. Null
    /// on shifts closed before it was stored (their summary is still computed live).</summary>
    public decimal? ClosingExpectedCash { get; private set; }

    public decimal? ClosingCashSalesTotal { get; private set; }

    public decimal? ClosingNonCashSalesTotal { get; private set; }

    public decimal? ClosingCashRefundsTotal { get; private set; }

    /// <summary>Cash customers paid against their accounts in the shift, frozen at close.</summary>
    public decimal? ClosingCashReceiptsTotal { get; private set; }

    public int? ClosingSalesCount { get; private set; }

    private CashShift() { }

    public static CashShift Open(Guid branchId, string openedBy, decimal openingFloat, string? notes)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(openedBy);
        if (openingFloat < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(openingFloat), "Opening float cannot be negative.");
        }

        return new CashShift
        {
            Id = Guid.CreateVersion7(),
            BranchId = branchId,
            OpenedAtUtc = DateTime.UtcNow,
            OpenedBy = openedBy.Trim(),
            OpeningFloat = openingFloat,
            Notes = notes?.Trim(),
            Status = CashShiftStatus.Open,
        };
    }

    public void Close(string closedBy, decimal closingCashCounted, string? closingNotes = null, CashDrawerTotals? frozenTotals = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(closedBy);
        if (closingCashCounted < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(closingCashCounted), "Counted cash cannot be negative.");
        }

        if (Status != CashShiftStatus.Open)
        {
            throw new CustomException(
                $"Cash shift is {Status} and cannot be closed again.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        ClosedAtUtc = DateTime.UtcNow;
        ClosedBy = closedBy.Trim();
        ClosingCashCounted = closingCashCounted;
        ClosingNotes = string.IsNullOrWhiteSpace(closingNotes) ? null : closingNotes.Trim();
        Status = CashShiftStatus.Closed;

        if (frozenTotals is not null)
        {
            ClosingCashSalesTotal = frozenTotals.CashSales;
            ClosingNonCashSalesTotal = frozenTotals.NonCashSales;
            ClosingCashRefundsTotal = frozenTotals.CashRefunds;
            ClosingCashReceiptsTotal = frozenTotals.CashReceipts;
            ClosingSalesCount = frozenTotals.SalesCount;
            ClosingExpectedCash = frozenTotals.ExpectedCash(OpeningFloat);
        }
    }
}
