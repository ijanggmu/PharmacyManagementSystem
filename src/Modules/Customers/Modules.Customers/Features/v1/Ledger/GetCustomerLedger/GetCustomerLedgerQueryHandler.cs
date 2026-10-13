using FSH.Framework.Shared.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetCustomerLedger;

public sealed class GetCustomerLedgerQueryHandler(CustomersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetCustomerLedgerQuery, PagedResponse<CustomerLedgerEntryDto>>
{
    public async ValueTask<PagedResponse<CustomerLedgerEntryDto>> Handle(
        GetCustomerLedgerQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.CustomerLedgerEntries
            .AsNoTracking()
            .Where(e => e.CustomerId == query.CustomerId);

        if (branchFilter is { } branchId)
        {
            q = q.Where(e => e.BranchId == branchId);
        }

        var ordered = q
            .OrderByDescending(e => e.EntryDateUtc)
            .ThenByDescending(e => e.CreatedAtUtc);

        long total = await ordered.LongCountAsync(cancellationToken).ConfigureAwait(false);
        int skip = (page - 1) * size;
        var items = await ordered
            .Skip(skip)
            .Take(size)
            .Select(e => new CustomerLedgerEntryDto(
                e.Id, e.CustomerId, e.EntryDateUtc, e.EntryType.ToString(), e.Description,
                e.DebitAmount, e.CreditAmount, e.RunningBalance, e.ReferenceType, e.ReferenceId, e.CreatedAtUtc,
                e.BranchId, e.DocumentNumber,
                dbContext.CustomerLedgerEntries.Any(v =>
                    v.ReferenceType == CustomerLedgerEntry.PaymentVoidReference && v.ReferenceId == e.Id)))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // RunningBalance is tenant-wide; filtered to one branch, recompute it from that branch's entries:
        // the balance after a row is the branch total minus everything newer than it.
        if (branchFilter is not null && items.Count > 0)
        {
            decimal branchTotal = await ordered.SumAsync(e => e.DebitAmount - e.CreditAmount, cancellationToken).ConfigureAwait(false);
            decimal newerThanPage = skip == 0
                ? 0m
                : await ordered.Take(skip).SumAsync(e => e.DebitAmount - e.CreditAmount, cancellationToken).ConfigureAwait(false);
            decimal balance = branchTotal - newerThanPage;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                items[i] = item with { RunningBalance = balance };
                balance -= item.DebitAmount - item.CreditAmount;
            }
        }

        return new PagedResponse<CustomerLedgerEntryDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
