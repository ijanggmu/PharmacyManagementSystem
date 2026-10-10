using FSH.Framework.Shared.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.CashShifts.SearchCashShifts;

public sealed class SearchCashShiftsQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchCashShiftsQuery, PagedResponse<CashShiftDto>>
{
    public async ValueTask<PagedResponse<CashShiftDto>> Handle(SearchCashShiftsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.CashShifts.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.Status)
            && Enum.TryParse<CashShiftStatus>(query.Status, ignoreCase: true, out var status))
        {
            q = q.Where(s => s.Status == status);
        }

        // Branch-required entity: an omitted branchId defaults to the current branch (explicit wins).
        // A null current branch (no tenant / operator call) leaves the query unfiltered.
        var branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        if (branchId is { } scopedBranchId)
        {
            q = q.Where(s => s.BranchId == scopedBranchId);
        }

        q = q.OrderByDescending(s => s.OpenedAtUtc);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var shifts = await q
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<CashShiftDto>
        {
            Items = shifts
                .Select(s => new CashShiftDto(
                    s.Id, s.OpenedAtUtc, s.OpenedBy, s.OpeningFloat, s.ClosedAtUtc, s.ClosedBy,
                    s.ClosingCashCounted, s.Status.ToString(), s.Notes, s.ClosingNotes, s.BranchId))
                .ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size)
        };
    }
}
