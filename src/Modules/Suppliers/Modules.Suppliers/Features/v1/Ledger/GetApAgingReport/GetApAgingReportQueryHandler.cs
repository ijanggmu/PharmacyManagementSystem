using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetApAgingReport;

/// <summary>
/// AP aging as of a date. Each supplier's ledger (up to the as-of date) is allocated across ALL branches
/// first — a payment made at one branch settles a bill booked at another, exactly as
/// <see cref="SupplierBillAllocator"/> does for the open-bills list — and only then are the bills filtered to
/// the requested branch. Filtering before allocating would leave a branch's bills looking unpaid when they
/// were paid from elsewhere, and would let another branch's bill absorb this branch's credits.
/// <para>Each open bill is bucketed twice: by its age (bill date) and by how far past its due date it is
/// (<see cref="PaymentTerms"/>; bills without terms land in <c>NoDueDate</c>).</para>
/// <para>A supplier paid in advance gets a line with the advance and no buckets, so the report's net total agrees
/// with the AP control account.</para>
/// </summary>
public sealed class GetApAgingReportQueryHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetApAgingReportQuery, IReadOnlyList<ApAgingReportLineDto>>
{
    public async ValueTask<IReadOnlyList<ApAgingReportLineDto>> Handle(
        GetApAgingReportQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var entries = await SupplierBillAllocator.LoadRowsAsync(dbContext, query.AsOfUtc, branchFilter, cancellationToken)
            .ConfigureAwait(false);

        if (entries.Count == 0)
        {
            return [];
        }

        var supplierIds = entries.Select(e => e.SupplierId).Distinct().ToList();
        var suppliers = await dbContext.Suppliers
            .AsNoTracking()
            .Where(s => supplierIds.Contains(s.Id))
            .Select(s => new { s.Id, s.Name, s.CreditDays })
            .ToDictionaryAsync(s => s.Id, cancellationToken)
            .ConfigureAwait(false);

        var lines = new List<ApAgingReportLineDto>();
        foreach (var group in entries.GroupBy(e => e.SupplierId))
        {
            // Bill-level settlement over the supplier's whole account (payments against a bill first, the
            // rest FIFO), then the branch filter — the same rule the open-bills list uses, so the two agree.
            var allocation = SupplierBillAllocator.Allocate(group);
            var bills = allocation.Bills.Where(b => branchFilter == null || b.Entry.BranchId == branchFilter);

            int? creditDays = suppliers.GetValueOrDefault(group.Key)?.CreditDays;
            var byDueDate = new DueBucketTotals();
            decimal current = 0m, days31To60 = 0m, days61To90 = 0m, over90 = 0m;
            foreach (var bill in bills)
            {
                decimal remaining = bill.Outstanding;
                if (remaining <= 0)
                {
                    continue;
                }

                DateTime? dueDateUtc = PaymentTerms.EffectiveDueDate(bill.Entry.DueDateUtc, bill.Entry.EntryDateUtc, creditDays);
                byDueDate.Add(PaymentTerms.BucketOf(dueDateUtc, query.AsOfUtc), remaining);

                int ageDays = (query.AsOfUtc - bill.Entry.EntryDateUtc).Days;
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

            // Credit left after every bill is settled is an advance to the supplier. It belongs to the supplier's
            // one account, not to a branch, so it is reported on the all-branches view.
            decimal advance = branchFilter is null ? allocation.UnappliedCredit : 0m;
            if (total <= 0 && advance <= 0)
            {
                continue;
            }

            lines.Add(new ApAgingReportLineDto(
                group.Key, suppliers.GetValueOrDefault(group.Key)?.Name ?? "(unknown)",
                current, days31To60, days61To90, over90, total,
                byDueDate.NotYetDue, byDueDate.Overdue1To30, byDueDate.Overdue31To60, byDueDate.Overdue61To90,
                byDueDate.OverdueOver90, byDueDate.NoDueDate, advance));
        }

        return lines.OrderByDescending(l => l.Total).ThenByDescending(l => l.UnappliedAdvance).ToList();
    }
}
