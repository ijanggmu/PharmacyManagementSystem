using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Banking.SearchBankReconciliations;

public sealed class SearchBankReconciliationsQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchBankReconciliationsQuery, PagedResponse<BankReconciliationDto>>
{
    public async ValueTask<PagedResponse<BankReconciliationDto>> Handle(
        SearchBankReconciliationsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.BankReconciliations.AsNoTracking().AsQueryable();

        // Explicit branchId wins; otherwise the caller's branch scope (null = view-all, no filter).
        var branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        if (branchId is { } scopedBranchId)
        {
            q = q.Where(r => r.BranchId == scopedBranchId);
        }

        if (query.AccountId is { } accountId)
        {
            // Rows from before the account was recorded were all of Bank 1010, so Bank also lists them.
            bool isBank = await dbContext.Accounts
                .AnyAsync(a => a.Id == accountId && a.Code == AccountingSystemAccountCodes.Bank, cancellationToken)
                .ConfigureAwait(false);
            q = isBank
                ? q.Where(r => r.AccountId == accountId || r.AccountId == null)
                : q.Where(r => r.AccountId == accountId);
        }

        q = q.OrderByDescending(r => r.AsOfUtc).ThenByDescending(r => r.Id);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var items = await q
            .Skip((page - 1) * size)
            .Take(size)
            .Select(r => new BankReconciliationDto(
                r.Id, r.AsOfUtc, r.GlBalance, r.StatementBalance, r.Variance, r.Notes, r.ReconciledBy, r.CreatedAtUtc, r.BranchId, r.AccountId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<BankReconciliationDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
