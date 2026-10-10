using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances.SearchOpeningBalanceHistory;

public sealed class SearchOpeningBalanceHistoryQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchOpeningBalanceHistoryQuery, PagedResponse<OpeningBalanceHistoryEntryDto>>
{
    public async ValueTask<PagedResponse<OpeningBalanceHistoryEntryDto>> Handle(
        SearchOpeningBalanceHistoryQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var q = dbContext.OpeningBalanceHistory.AsNoTracking().AsQueryable();
        if (branchFilter is { } branchId)
        {
            q = q.Where(h => h.BranchId == branchId);
        }

        int total = await q.CountAsync(cancellationToken).ConfigureAwait(false);
        var page = await q
            .OrderByDescending(h => h.PerformedAtUtc)
            .ThenByDescending(h => h.Sequence)
            .ThenByDescending(h => h.Id)
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var voucherIds = page
            .SelectMany(h => new[] { h.PostedVoucherId, h.ReversedVoucherId, h.ReversalVoucherId })
            .OfType<Guid>()
            .Distinct()
            .ToList();
        var voucherNos = await dbContext.Vouchers.AsNoTracking()
            .Where(v => voucherIds.Contains(v.Id))
            .Select(v => new { v.Id, v.VoucherNo })
            .ToDictionaryAsync(v => v.Id, v => v.VoucherNo, cancellationToken)
            .ConfigureAwait(false);

        string? No(Guid? id) => id is { } value && voucherNos.TryGetValue(value, out var no) ? no : null;

        var items = page.Select(h => new OpeningBalanceHistoryEntryDto(
                h.Id, h.Sequence, h.Action.ToString(), h.BranchId, h.OpeningDate, h.PreviousOpeningDate,
                h.PostedVoucherId, No(h.PostedVoucherId),
                h.ReversedVoucherId, No(h.ReversedVoucherId),
                h.ReversalVoucherId, No(h.ReversalVoucherId),
                h.TotalDebit, h.TotalCredit, h.EquityAdjustmentDebit, h.EquityAdjustmentCredit,
                h.Reason, h.PerformedByUserId, h.PerformedByName, h.PerformedAtUtc,
                h.ReadChanges()
                    .Select(c => new OpeningBalanceChangeDto(
                        c.AccountId, c.AccountCode, c.AccountName, c.BeforeDebit, c.BeforeCredit, c.AfterDebit, c.AfterCredit))
                    .ToList()))
            .ToList();

        return new PagedResponse<OpeningBalanceHistoryEntryDto>
        {
            Items = items,
            PageNumber = query.PageNumber,
            PageSize = query.PageSize,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)query.PageSize),
        };
    }
}
