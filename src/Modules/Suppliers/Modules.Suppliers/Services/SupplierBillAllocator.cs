using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Services;

/// <summary>One AP ledger row as the allocator needs it.</summary>
internal sealed record SupplierLedgerRow(
    Guid Id,
    Guid SupplierId,
    DateTime EntryDateUtc,
    DateTime CreatedAtUtc,
    SupplierLedgerEntryType EntryType,
    decimal DebitAmount,
    decimal CreditAmount,
    string? ReferenceType,
    Guid? ReferenceId,
    string? DocumentNumber,
    string? SupplierBillNumber,
    Guid? BranchId);

/// <summary>A payable (every debit on the AP ledger) and how much of it has been settled.</summary>
internal sealed class SupplierBill(SupplierLedgerRow entry)
{
    public SupplierLedgerRow Entry { get; } = entry;

    /// <summary>The key a payment uses to target this bill: the purchase document's reference, or the
    /// ledger entry itself for a debit without one (opening balance, adjustment).</summary>
    public string ReferenceType { get; } = entry.ReferenceType ?? SupplierBillAllocator.LedgerEntryReference;

    public Guid ReferenceId { get; } = entry.ReferenceId ?? entry.Id;

    public decimal Amount => Entry.DebitAmount;

    public decimal Paid { get; set; }

    public decimal Credited { get; set; }

    public decimal Outstanding => Amount - Paid - Credited;
}

/// <summary>
/// Works out what is still owed on each supplier bill. Credits that name a bill settle that bill first:
/// a payment recorded against a bill, or the void of a direct goods receipt. Every other credit (an
/// unallocated payment, a supplier return, a negative opening balance) and any part of a named credit
/// beyond its bill's outstanding settles the remaining open bills oldest first (FIFO); whatever is still
/// left is an advance carried to bills recorded later. Totals always equal the ledger balance, so AP
/// aging, the open-bills list and the supplier balance agree.
/// </summary>
internal static class SupplierBillAllocator
{
    /// <summary>Reference type a payment uses for a bill that is a plain ledger debit (opening balance,
    /// adjustment) rather than a purchase document; its id is the ledger entry id.</summary>
    public const string LedgerEntryReference = "LedgerEntry";

    public sealed record Result(IReadOnlyList<SupplierBill> Bills, decimal UnappliedCredit);

    public static Result Allocate(IEnumerable<SupplierLedgerRow> rows)
    {
        ArgumentNullException.ThrowIfNull(rows);

        var ordered = rows.OrderBy(r => r.EntryDateUtc).ThenBy(r => r.CreatedAtUtc).ToList();
        var bills = ordered.Where(r => r.DebitAmount > 0).Select(r => new SupplierBill(r)).ToList();
        var byKey = new Dictionary<(string, Guid), SupplierBill>();
        foreach (var bill in bills)
        {
            byKey.TryAdd((bill.ReferenceType, bill.ReferenceId), bill);
        }

        var credits = ordered.Where(r => r.CreditAmount > 0).ToList();
        var leftovers = new List<(SupplierLedgerRow Row, decimal Amount)>();

        // Pass 1: credits that name their bill settle it first, whatever their date.
        foreach (var credit in credits)
        {
            decimal remaining = credit.CreditAmount;
            if (TargetKey(credit) is { } key && byKey.TryGetValue(key, out var target))
            {
                remaining -= Apply(target, credit, remaining);
            }

            if (remaining > 0)
            {
                leftovers.Add((credit, remaining));
            }
        }

        // Pass 2: everything else settles the oldest open bills, in the order the credits happened.
        decimal unapplied = 0m;
        foreach (var (credit, amount) in leftovers)
        {
            decimal remaining = amount;
            foreach (var bill in bills)
            {
                if (remaining <= 0)
                {
                    break;
                }

                remaining -= Apply(bill, credit, remaining);
            }

            unapplied += remaining;
        }

        return new Result(bills, unapplied);
    }

    /// <summary>Loads one supplier's ledger and allocates it (all branches: a bill can be paid from any branch).</summary>
    public static async Task<Result> AllocateForSupplierAsync(
        SuppliersDbContext dbContext, Guid supplierId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var rows = await dbContext.SupplierLedgerEntries
            .AsNoTracking()
            .Where(e => e.SupplierId == supplierId)
            .Select(e => new SupplierLedgerRow(
                e.Id, e.SupplierId, e.EntryDateUtc, e.CreatedAtUtc, e.EntryType, e.DebitAmount, e.CreditAmount,
                e.ReferenceType, e.ReferenceId, e.DocumentNumber, e.SupplierBillNumber, e.BranchId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return Allocate(rows);
    }

    private static (string, Guid)? TargetKey(SupplierLedgerRow credit)
    {
        if (credit.ReferenceType is null || credit.ReferenceId is not { } id)
        {
            return null;
        }

        if (credit.EntryType == SupplierLedgerEntryType.Payment)
        {
            return (credit.ReferenceType, id);
        }

        // Voiding a direct goods receipt credits back that same receipt.
        return string.Equals(credit.ReferenceType, "DirectGoodsReceiptVoid", StringComparison.Ordinal)
            ? ("DirectGoodsReceipt", id)
            : null;
    }

    private static decimal Apply(SupplierBill bill, SupplierLedgerRow credit, decimal available)
    {
        decimal applied = Math.Min(bill.Outstanding, available);
        if (applied <= 0)
        {
            return 0m;
        }

        if (credit.EntryType == SupplierLedgerEntryType.Payment)
        {
            bill.Paid += applied;
        }
        else
        {
            bill.Credited += applied;
        }

        return applied;
    }
}
