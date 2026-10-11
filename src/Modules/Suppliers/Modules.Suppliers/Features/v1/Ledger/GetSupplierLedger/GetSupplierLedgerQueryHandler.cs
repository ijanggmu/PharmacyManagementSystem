using FSH.Framework.Shared.Persistence;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierLedger;

public sealed class GetSupplierLedgerQueryHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetSupplierLedgerQuery, PagedResponse<SupplierLedgerEntryDto>>
{
    public async ValueTask<PagedResponse<SupplierLedgerEntryDto>> Handle(
        GetSupplierLedgerQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.SupplierLedgerEntries
            .AsNoTracking()
            .Where(e => e.SupplierId == query.SupplierId);

        if (branchFilter is { } branchId)
        {
            q = q.Where(e => e.BranchId == branchId);
        }

        q = q.OrderByDescending(e => e.EntryDateUtc)
            .ThenByDescending(e => e.CreatedAtUtc);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        int skip = (page - 1) * size;
        var items = await q
            .Skip(skip)
            .Take(size)
            .Select(e => new SupplierLedgerEntryDto(
                e.Id, e.SupplierId, e.EntryDateUtc, e.EntryType.ToString(), e.Description,
                e.DebitAmount, e.CreditAmount, e.RunningBalance, e.ReferenceType, e.ReferenceId, e.CreatedAtUtc, e.BranchId,
                e.DocumentNumber, e.SupplierBillNumber))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // RunningBalance is tenant-wide; filtered to one branch, recompute it from that branch's entries:
        // the balance after a row is the branch total minus everything newer than it.
        if (branchFilter is not null && items.Count > 0)
        {
            decimal branchTotal = await q.SumAsync(e => e.DebitAmount - e.CreditAmount, cancellationToken).ConfigureAwait(false);
            decimal newerThanPage = skip == 0
                ? 0m
                : await q.Take(skip).SumAsync(e => e.DebitAmount - e.CreditAmount, cancellationToken).ConfigureAwait(false);
            decimal balance = branchTotal - newerThanPage;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                items[i] = item with { RunningBalance = balance };
                balance -= item.DebitAmount - item.CreditAmount;
            }
        }

        return new PagedResponse<SupplierLedgerEntryDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
