using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
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

        var entriesQuery = dbContext.CustomerLedgerEntries
            .AsNoTracking()
            .Where(e => e.EntryDateUtc <= query.AsOfUtc);

        if (branchFilter is { } branchId)
        {
            entriesQuery = entriesQuery.Where(e => e.BranchId == branchId);
        }

        var entries = await entriesQuery
            .OrderBy(e => e.EntryDateUtc).ThenBy(e => e.CreatedAtUtc)
            .Select(e => new { e.CustomerId, e.EntryDateUtc, e.DebitAmount, e.CreditAmount })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (entries.Count == 0)
        {
            return [];
        }

        var customerNames = await dbContext.Customers
            .AsNoTracking()
            .Where(c => entries.Select(e => e.CustomerId).Distinct().Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => c.Name, cancellationToken)
            .ConfigureAwait(false);

        var lines = new List<ArAgingReportLineDto>();
        foreach (var group in entries.GroupBy(e => e.CustomerId))
        {
            // FIFO settlement: each credit (payment/refund/adjustment) pays down the oldest still-open
            // debit first — there is no invoice-level allocation in this system to match a payment to
            // a specific sale, so this is the standard aging approximation for that case.
            var openDebits = new List<(DateTime EntryDateUtc, decimal Remaining)>();
            foreach (var entry in group)
            {
                if (entry.DebitAmount > 0)
                {
                    openDebits.Add((entry.EntryDateUtc, entry.DebitAmount));
                }

                decimal credit = entry.CreditAmount;
                for (int i = 0; i < openDebits.Count && credit > 0; i++)
                {
                    var (entryDateUtc, remaining) = openDebits[i];
                    decimal applied = Math.Min(remaining, credit);
                    openDebits[i] = (entryDateUtc, remaining - applied);
                    credit -= applied;
                }
            }

            decimal current = 0m, days31To60 = 0m, days61To90 = 0m, over90 = 0m;
            foreach (var (entryDateUtc, remaining) in openDebits)
            {
                if (remaining <= 0)
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
}
