using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
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
/// </summary>
public sealed class GetApAgingReportQueryHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetApAgingReportQuery, IReadOnlyList<ApAgingReportLineDto>>
{
    public async ValueTask<IReadOnlyList<ApAgingReportLineDto>> Handle(
        GetApAgingReportQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        // With a branch filter, only suppliers that have entries at that branch can have bills there.
        var entriesQuery = dbContext.SupplierLedgerEntries.AsNoTracking().Where(e => e.EntryDateUtc <= query.AsOfUtc);
        if (branchFilter is { } branchId)
        {
            var suppliersAtBranch = dbContext.SupplierLedgerEntries
                .Where(e => e.EntryDateUtc <= query.AsOfUtc && e.BranchId == branchId)
                .Select(e => e.SupplierId);
            entriesQuery = entriesQuery.Where(e => suppliersAtBranch.Contains(e.SupplierId));
        }

        var entries = await entriesQuery
            .Select(e => new SupplierLedgerRow(
                e.Id, e.SupplierId, e.EntryDateUtc, e.CreatedAtUtc, e.EntryType, e.DebitAmount, e.CreditAmount,
                e.ReferenceType, e.ReferenceId, e.DocumentNumber, e.SupplierBillNumber, e.BranchId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (entries.Count == 0)
        {
            return [];
        }

        var supplierIds = entries.Select(e => e.SupplierId).Distinct().ToList();
        var supplierNames = await dbContext.Suppliers
            .AsNoTracking()
            .Where(s => supplierIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => s.Name, cancellationToken)
            .ConfigureAwait(false);

        var lines = new List<ApAgingReportLineDto>();
        foreach (var group in entries.GroupBy(e => e.SupplierId))
        {
            // Bill-level settlement over the supplier's whole account (payments against a bill first, the
            // rest FIFO), then the branch filter — the same rule the open-bills list uses, so the two agree.
            var allocation = SupplierBillAllocator.Allocate(group);
            var bills = allocation.Bills.Where(b => branchFilter == null || b.Entry.BranchId == branchFilter);

            decimal current = 0m, days31To60 = 0m, days61To90 = 0m, over90 = 0m;
            foreach (var bill in bills)
            {
                decimal remaining = bill.Outstanding;
                if (remaining <= 0)
                {
                    continue;
                }

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
            if (total <= 0)
            {
                continue;
            }

            lines.Add(new ApAgingReportLineDto(
                group.Key, supplierNames.GetValueOrDefault(group.Key, "(unknown)"),
                current, days31To60, days61To90, over90, total));
        }

        return lines.OrderByDescending(l => l.Total).ToList();
    }
}
