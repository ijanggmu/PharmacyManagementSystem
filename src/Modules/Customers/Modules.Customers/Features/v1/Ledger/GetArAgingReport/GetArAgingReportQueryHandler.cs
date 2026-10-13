using FSH.Framework.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetArAgingReport;

/// <summary>
/// AR aging as of a date. Each still-open debit (FIFO settlement, <see cref="CustomerDebtSettlement"/>) is bucketed
/// twice: by its age (entry date) and by how far past its due date it is (<see cref="PaymentTerms"/>; debits of a
/// customer without terms land in <c>NoDueDate</c>).
/// </summary>
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
        var entries = await CustomerDebtSettlement.LoadRowsAsync(dbContext, query.AsOfUtc, branchFilter, null, cancellationToken)
            .ConfigureAwait(false);

        if (entries.Count == 0)
        {
            return [];
        }

        // Trashed customers' balances are still receivable, so their names are resolved too.
        var customerIds = entries.Select(e => e.CustomerId).Distinct().ToList();
        var customers = await dbContext.Customers
            .AsNoTracking()
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .Where(c => customerIds.Contains(c.Id))
            .Select(c => new { c.Id, c.Name, c.CreditDays })
            .ToDictionaryAsync(c => c.Id, cancellationToken)
            .ConfigureAwait(false);

        var lines = new List<ArAgingReportLineDto>();
        foreach (var group in entries.GroupBy(e => e.CustomerId))
        {
            int? creditDays = customers.GetValueOrDefault(group.Key)?.CreditDays;
            var byDueDate = new DueBucketTotals();
            decimal current = 0m, days31To60 = 0m, days61To90 = 0m, over90 = 0m;
            foreach (var (row, remaining) in CustomerDebtSettlement.OpenDebits(group))
            {
                if (branchFilter is { } onlyBranch && row.BranchId != onlyBranch)
                {
                    continue;
                }

                DateTime? dueDateUtc = PaymentTerms.EffectiveDueDate(row.DueDateUtc, row.EntryDateUtc, creditDays);
                byDueDate.Add(PaymentTerms.BucketOf(dueDateUtc, query.AsOfUtc), remaining);

                int ageDays = (query.AsOfUtc - row.EntryDateUtc).Days;
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
                group.Key, customers.GetValueOrDefault(group.Key)?.Name ?? "(unknown)",
                current, days31To60, days61To90, over90, total,
                byDueDate.NotYetDue, byDueDate.Overdue1To30, byDueDate.Overdue31To60, byDueDate.Overdue61To90,
                byDueDate.OverdueOver90, byDueDate.NoDueDate));
        }

        return lines.OrderByDescending(l => l.Total).ToList();
    }

    /// <summary>
    /// FIFO settlement of one customer's entries (in chronological order) — see <see cref="CustomerDebtSettlement"/>.
    /// Returns the debits still (partly) open, with what remains on each.
    /// </summary>
    public static IReadOnlyList<(DateTime EntryDateUtc, decimal Remaining)> SettleFifo(
        IEnumerable<(DateTime EntryDateUtc, decimal DebitAmount, decimal CreditAmount)> entries)
    {
        ArgumentNullException.ThrowIfNull(entries);

        return CustomerDebtSettlement.SettleFifo(entries.Select(e => (e.EntryDateUtc, e.DebitAmount, e.CreditAmount, 0)))
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

        return CustomerDebtSettlement.SettleFifo(entries.Select(e => (e.EntryDateUtc, e.DebitAmount, e.CreditAmount, e.BranchId)))
            .Select(d => (d.EntryDateUtc, d.Remaining, d.Tag))
            .ToList();
    }
}
