using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Banking.SearchBankDeposits;

public sealed class SearchBankDepositsQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchBankDepositsQuery, PagedResponse<BankDepositDto>>
{
    public async ValueTask<PagedResponse<BankDepositDto>> Handle(SearchBankDepositsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.BankDeposits.AsNoTracking().AsQueryable();

        if (query.DateFromUtc is { } from)
        {
            q = q.Where(d => d.DepositDateUtc >= from);
        }

        if (query.DateToUtc is { } to)
        {
            q = q.Where(d => d.DepositDateUtc <= to);
        }

        // Branch-required entity: an omitted branchId defaults to the current branch (explicit wins).
        // A null current branch (no tenant / operator call) leaves the query unfiltered.
        var branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        if (branchId is { } scopedBranchId)
        {
            q = q.Where(d => d.BranchId == scopedBranchId);
        }

        // Same-day deposits are common; the tie-breakers keep pages stable.
        q = q.OrderByDescending(d => d.DepositDateUtc).ThenByDescending(d => d.CreatedAtUtc).ThenByDescending(d => d.Id);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var items = await q
            .Skip((page - 1) * size)
            .Take(size)
            .Select(d => new BankDepositDto(d.Id, d.DepositDateUtc, d.Amount, d.Description, d.RecordedBy, d.CreatedAtUtc, d.BranchId, d.AccountId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<BankDepositDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
