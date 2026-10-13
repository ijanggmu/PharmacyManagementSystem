using FSH.Framework.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetArAgingReport;

public sealed class GetArAgingReportQueryHandler(CustomersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetArAgingReportQuery, IReadOnlyList<ArAgingReportLineDto>>
{
    public async ValueTask<IReadOnlyList<ArAgingReportLineDto>> Handle(
        GetArAgingReportQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        // A customer's payments settle their oldest debts whatever branch either was recorded at (one account
        // per customer), so settlement runs over the customer's entries at ALL branches; only the debts still
        // open afterwards are filtered by branch. Filtering the entries first would age a debt at branch A as
        // unpaid when it was paid at branch B — and leave B's payment as unapplied credit.
        IQueryable<CustomerLedgerEntry> entriesQuery = dbContext.CustomerLedgerEntries
            .AsNoTracking()
            .Where(e => e.EntryDateUtc <= query.AsOfUtc)
            // A payment voided by the as-of date and its void cancel out: both are left out, so the void's debit
            // isn't aged as a new debt and the debts the payment had settled are open again.
            .Where(e => e.ReferenceType != CustomerLedgerEntry.PaymentVoidReference)
            .Where(e => !dbContext.CustomerLedgerEntries.Any(v =>
                v.ReferenceType == CustomerLedgerEntry.PaymentVoidReference
                && v.ReferenceId == e.Id
                && v.EntryDateUtc <= query.AsOfUtc));

        if (branchFilter is { } branchId)
        {
            entriesQuery = entriesQuery.Where(e => dbContext.CustomerLedgerEntries
                .Any(b => b.CustomerId == e.CustomerId && b.BranchId == branchId && b.EntryDateUtc <= query.AsOfUtc));
        }

        var entries = await entriesQuery
            .OrderBy(e => e.EntryDateUtc).ThenBy(e => e.CreatedAtUtc)
            .Select(e => new { e.CustomerId, e.EntryDateUtc, e.DebitAmount, e.CreditAmount, e.BranchId })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (entries.Count == 0)
        {
            return [];
        }

        // Trashed customers' balances are still receivable, so their names are resolved too.
        var customerNames = await dbContext.Customers
            .AsNoTracking()
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .Where(c => entries.Select(e => e.CustomerId).Distinct().Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => c.Name, cancellationToken)
            .ConfigureAwait(false);

        var lines = new List<ArAgingReportLineDto>();
        foreach (var group in entries.GroupBy(e => e.CustomerId))
        {
            var openDebits = SettleFifo(group.Select(e => (e.EntryDateUtc, e.DebitAmount, e.CreditAmount, e.BranchId)));

            decimal current = 0m, days31To60 = 0m, days61To90 = 0m, over90 = 0m;
            foreach (var (entryDateUtc, remaining, debitBranchId) in openDebits)
            {
                if (remaining <= 0 || (branchFilter is { } onlyBranch && debitBranchId != onlyBranch))
                {
                    continue;
                }

                int ageDays = (query.AsOfUtc - entryDateUtc).Days;
                if (ageDays <= 30)
                {
                    current += remaining;
                }
                else if (ageDays <= 60)
                {
                    days31To60 += remaining;
                }
                else if (ageDays <= 90)
                {
                    days61To90 += remaining;
                }
                else
                {
                    over90 += remaining;
                }
            }

            decimal total = current + days31To60 + days61To90 + over90;
            if (total <= 0)
            {
                continue;
            }

            lines.Add(new ArAgingReportLineDto(
                group.Key, customerNames.GetValueOrDefault(group.Key, "(unknown)"),
                current, days31To60, days61To90, over90, total));
        }

        return lines.OrderByDescending(l => l.Total).ToList();
    }

    /// <summary>
    /// FIFO settlement of one customer's entries (in chronological order): each credit (payment, refund,
    /// adjustment) pays down the oldest still-open debit first — there is no invoice-level allocation in
    /// this system to match a payment to a specific sale, so this is the standard aging approximation.
    /// A credit larger than everything open at the time (an advance payment, an overpayment) is carried
    /// forward and applied to later debits, so the buckets always add up to the customer's net balance.
    /// Returns the debits still (partly) open, with what remains on each.
    /// </summary>
    public static IReadOnlyList<(DateTime EntryDateUtc, decimal Remaining)> SettleFifo(
        IEnumerable<(DateTime EntryDateUtc, decimal DebitAmount, decimal CreditAmount)> entries)
    {
        ArgumentNullException.ThrowIfNull(entries);

        return SettleFifo(entries.Select(e => (e.EntryDateUtc, e.DebitAmount, e.CreditAmount, (Guid?)null)))
            .Select(d => (d.EntryDateUtc, d.Remaining))
            .ToList();
    }

    /// <summary>
    /// <see cref="SettleFifo(IEnumerable{ValueTuple{DateTime, decimal, decimal}})"/> over ALL of a customer's
    /// entries, keeping each open debit's branch so the caller can filter the result by branch afterwards.
    /// </summary>
    public static IReadOnlyList<(DateTime EntryDateUtc, decimal Remaining, Guid? BranchId)> SettleFifo(
        IEnumerable<(DateTime EntryDateUtc, decimal DebitAmount, decimal CreditAmount, Guid? BranchId)> entries)
    {
        ArgumentNullException.ThrowIfNull(entries);

        var openDebits = new List<(DateTime EntryDateUtc, decimal Remaining, Guid? BranchId)>();
        decimal unappliedCredit = 0m;

        foreach (var (entryDateUtc, debitAmount, creditAmount, branchId) in entries)
        {
            if (debitAmount > 0)
            {
                // Credit already on account (paid in advance) settles the new debit first.
                decimal fromCredit = Math.Min(debitAmount, unappliedCredit);
                unappliedCredit -= fromCredit;
                openDebits.Add((entryDateUtc, debitAmount - fromCredit, branchId));
            }

            decimal credit = creditAmount;
            for (int i = 0; i < openDebits.Count && credit > 0; i++)
            {
                var (debitDateUtc, remaining, debitBranchId) = openDebits[i];
                decimal applied = Math.Min(remaining, credit);
                openDebits[i] = (debitDateUtc, remaining - applied, debitBranchId);
                credit -= applied;
            }

            unappliedCredit += credit;
        }

        return openDebits.Where(d => d.Remaining > 0).ToList();
    }
}
