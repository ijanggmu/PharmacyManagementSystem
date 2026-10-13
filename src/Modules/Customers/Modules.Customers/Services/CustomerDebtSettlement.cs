using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Services;

/// <summary>One AR ledger row as the aging / receivables-due reports need it.</summary>
internal sealed record CustomerArRow(
    Guid Id,
    Guid CustomerId,
    DateTime EntryDateUtc,
    CustomerLedgerEntryType EntryType,
    decimal DebitAmount,
    decimal CreditAmount,
    Guid? BranchId,
    string? DocumentNumber,
    string? ReferenceType,
    Guid? ReferenceId,
    DateTime? DueDateUtc);

/// <summary>
/// Works out which of a customer's debits are still open. There is no invoice-level payment allocation in the AR
/// ledger, so every credit (payment, refund, adjustment) pays down the oldest open debit first (FIFO) — the
/// standard aging approximation. Settlement always runs over the customer's entries at ALL branches (one account
/// per customer); callers filter the open debits by branch afterwards.
/// </summary>
internal static class CustomerDebtSettlement
{
    /// <summary>
    /// The AR rows dated on or before <paramref name="asOfUtc"/>, in posting order, with voided payments and their
    /// voids left out (they cancel out). With <paramref name="branchFilter"/>, only customers with entries at that
    /// branch — but all their rows; with <paramref name="customerId"/>, only that customer.
    /// </summary>
    public static async Task<List<CustomerArRow>> LoadRowsAsync(
        CustomersDbContext dbContext, DateTime asOfUtc, Guid? branchFilter, Guid? customerId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        IQueryable<CustomerLedgerEntry> entriesQuery = dbContext.CustomerLedgerEntries
            .AsNoTracking()
            .Where(e => e.EntryDateUtc <= asOfUtc)
            // A payment voided by the as-of date and its void cancel out: both are left out, so the void's debit
            // isn't aged as a new debt and the debts the payment had settled are open again.
            .Where(e => e.ReferenceType != CustomerLedgerEntry.PaymentVoidReference)
            .Where(e => !dbContext.CustomerLedgerEntries.Any(v =>
                v.ReferenceType == CustomerLedgerEntry.PaymentVoidReference
                && v.ReferenceId == e.Id
                && v.EntryDateUtc <= asOfUtc));

        if (customerId is { } onlyCustomer)
        {
            entriesQuery = entriesQuery.Where(e => e.CustomerId == onlyCustomer);
        }

        if (branchFilter is { } branchId)
        {
            entriesQuery = entriesQuery.Where(e => dbContext.CustomerLedgerEntries
                .Any(b => b.CustomerId == e.CustomerId && b.BranchId == branchId && b.EntryDateUtc <= asOfUtc));
        }

        return await entriesQuery
            .OrderBy(e => e.EntryDateUtc).ThenBy(e => e.CreatedAtUtc)
            .Select(e => new CustomerArRow(
                e.Id, e.CustomerId, e.EntryDateUtc, e.EntryType, e.DebitAmount, e.CreditAmount, e.BranchId,
                e.DocumentNumber, e.ReferenceType, e.ReferenceId, e.DueDateUtc))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }

    /// <summary>
    /// FIFO settlement of one customer's entries (in chronological order). A credit larger than everything open
    /// at the time (an advance, an overpayment) is carried forward and applied to later debits, so what stays open
    /// always adds up to the customer's net balance. Returns the debits still (partly) open, with what remains on
    /// each and the <paramref name="entries"/>' tag (branch, due date, …) carried through.
    /// </summary>
    public static IReadOnlyList<(DateTime EntryDateUtc, decimal Remaining, T Tag)> SettleFifo<T>(
        IEnumerable<(DateTime EntryDateUtc, decimal DebitAmount, decimal CreditAmount, T Tag)> entries)
    {
        ArgumentNullException.ThrowIfNull(entries);

        var openDebits = new List<(DateTime EntryDateUtc, decimal Remaining, T Tag)>();
        decimal unappliedCredit = 0m;

        foreach (var (entryDateUtc, debitAmount, creditAmount, tag) in entries)
        {
            if (debitAmount > 0)
            {
                // Credit already on account (paid in advance) settles the new debit first.
                decimal fromCredit = Math.Min(debitAmount, unappliedCredit);
                unappliedCredit -= fromCredit;
                openDebits.Add((entryDateUtc, debitAmount - fromCredit, tag));
            }

            decimal credit = creditAmount;
            for (int i = 0; i < openDebits.Count && credit > 0; i++)
            {
                var (debitDateUtc, remaining, debitTag) = openDebits[i];
                decimal applied = Math.Min(remaining, credit);
                openDebits[i] = (debitDateUtc, remaining - applied, debitTag);
                credit -= applied;
            }

            unappliedCredit += credit;
        }

        return openDebits.Where(d => d.Remaining > 0).ToList();
    }

    /// <summary>The open debits of one customer's <paramref name="rows"/>, each with its row.</summary>
    public static IReadOnlyList<(CustomerArRow Row, decimal Remaining)> OpenDebits(IEnumerable<CustomerArRow> rows)
    {
        ArgumentNullException.ThrowIfNull(rows);
        return SettleFifo(rows.Select(r => (r.EntryDateUtc, r.DebitAmount, r.CreditAmount, r)))
            .Select(d => (d.Tag, d.Remaining))
            .ToList();
    }
}
