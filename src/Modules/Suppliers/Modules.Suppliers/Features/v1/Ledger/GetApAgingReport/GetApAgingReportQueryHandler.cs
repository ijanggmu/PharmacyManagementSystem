using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetApAgingReport;

public sealed class GetApAgingReportQueryHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetApAgingReportQuery, IReadOnlyList<ApAgingReportLineDto>>
{
    public async ValueTask<IReadOnlyList<ApAgingReportLineDto>> Handle(
        GetApAgingReportQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var entries = await dbContext.SupplierLedgerEntries
            .AsNoTracking()
            .Where(e => e.EntryDateUtc <= query.AsOfUtc
                && (branchFilter == null || e.BranchId == branchFilter))
            .Select(e => new SupplierLedgerRow(
                e.Id, e.SupplierId, e.EntryDateUtc, e.CreatedAtUtc, e.EntryType, e.DebitAmount, e.CreditAmount,
                e.ReferenceType, e.ReferenceId, e.DocumentNumber, e.SupplierBillNumber, e.BranchId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (entries.Count == 0)
        {
            return [];
        }

        var supplierNames = await dbContext.Suppliers
            .AsNoTracking()
            .Where(s => entries.Select(e => e.SupplierId).Distinct().Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => s.Name, cancellationToken)
            .ConfigureAwait(false);

        var lines = new List<ApAgingReportLineDto>();
        foreach (var group in entries.GroupBy(e => e.SupplierId))
        {
            // Bill-level settlement (payments against a bill first, the rest FIFO) — SupplierBillAllocator,
            // the same rule the open-bills list uses, so the two always agree.
            var allocation = SupplierBillAllocator.Allocate(group);

            decimal current = 0m, days31To60 = 0m, days61To90 = 0m, over90 = 0m;
            foreach (var bill in allocation.Bills)
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
