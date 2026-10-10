using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Banking.SearchBankStatementImports;

public sealed class SearchBankStatementImportsQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchBankStatementImportsQuery, PagedResponse<BankStatementImportSummaryDto>>
{
    public async ValueTask<PagedResponse<BankStatementImportSummaryDto>> Handle(
        SearchBankStatementImportsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.BankStatementImports.AsNoTracking().AsQueryable();

        if (query.AccountId is { } accountId)
        {
            q = q.Where(i => i.AccountId == accountId);
        }

        // Explicit branchId wins; otherwise the caller's branch scope (null = view-all, no filter).
        var branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        if (branchId is { } scopedBranchId)
        {
            q = q.Where(i => i.BranchId == scopedBranchId);
        }

        q = q.OrderByDescending(i => i.CreatedAtUtc).ThenByDescending(i => i.Id);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var imports = await q
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var items = imports
            .Select(i => new BankStatementImportSummaryDto(
                i.Id,
                i.AccountId,
                i.StatementLabel,
                i.PeriodStartUtc,
                i.PeriodEndUtc,
                i.OpeningBalance,
                i.ClosingBalance,
                i.Status.ToString(),
                i.CreatedBy,
                i.CreatedAtUtc,
                i.ReconciledBy,
                i.ReconciledAtUtc,
                i.BranchId))
            .ToList();

        return new PagedResponse<BankStatementImportSummaryDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
