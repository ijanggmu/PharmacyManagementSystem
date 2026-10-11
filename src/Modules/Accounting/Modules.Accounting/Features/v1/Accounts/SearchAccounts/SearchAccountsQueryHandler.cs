using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Accounts.SearchAccounts;

public sealed class SearchAccountsQueryHandler(AccountingDbContext dbContext)
    : IQueryHandler<SearchAccountsQuery, PagedResponse<AccountingAccountDto>>
{
    public async ValueTask<PagedResponse<AccountingAccountDto>> Handle(SearchAccountsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 500 ? 50 : query.PageSize;

        var q = dbContext.Accounts.AsNoTracking().AsQueryable();

        if (query.IsActive is { } isActive)
        {
            q = q.Where(a => a.IsActive == isActive);
        }

        if (!string.IsNullOrWhiteSpace(query.AccountType)
            && Enum.TryParse<AccountingAccountType>(query.AccountType, ignoreCase: true, out var accountType))
        {
            q = q.Where(a => a.AccountType == accountType);
        }

        if (query.PostableOnly)
        {
            // Leaves only: active, not a root head, no sub-accounts — the accounts voucher lines may use.
            q = q.Where(a => a.IsActive
                && !(a.ParentId == null && a.IsSystem && a.Code.Length == 1)
                && !dbContext.Accounts.Any(c => c.ParentId == a.Id));
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string term = query.Search.Trim();
            q = q.Where(a =>
                EF.Functions.ILike(a.Name, $"%{term}%") ||
                EF.Functions.ILike(a.Code, $"%{term}%"));
        }

        q = q.OrderBy(a => a.Code);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var accounts = await q
            .Skip((page - 1) * size)
            .Take(size)
            .ToDto(dbContext)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<AccountingAccountDto>
        {
            Items = accounts,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size)
        };
    }
}
