using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Cheques.SearchCheques;

/// <summary>
/// The cheque register, earliest cheque date first (the order they need banking / funding). Branch scope follows the
/// list rule (an omitted branch is the current one); cheques from payments recorded without a branch show in every
/// branch.
/// </summary>
public sealed class SearchChequesQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch, TimeProvider timeProvider)
    : IQueryHandler<SearchChequesQuery, PagedResponse<ChequeDto>>
{
    private static readonly ChequeStatus[] Final = [ChequeStatus.Cleared, ChequeStatus.Bounced, ChequeStatus.Cancelled];

    public async ValueTask<PagedResponse<ChequeDto>> Handle(SearchChequesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.Cheques.AsNoTracking().AsQueryable();

        if (Cheque.StatusFromWire(query.Status) is { } status)
        {
            q = q.Where(c => c.Status == status);
        }

        if (Cheque.DirectionFromWire(query.Direction) is { } direction)
        {
            q = q.Where(c => c.Direction == direction);
        }

        if (query.ChequeDateFromUtc is { } from)
        {
            q = q.Where(c => c.ChequeDateUtc >= from);
        }

        if (query.ChequeDateToUtc is { } to)
        {
            q = q.Where(c => c.ChequeDateUtc <= to);
        }

        if (query.DueOnly)
        {
            // Due = still in play and dated on or before today (a Nepal day).
            DateOnly today = NepalDate.FromUtc(query.AsOfUtc ?? timeProvider.GetUtcNow().UtcDateTime);
            DateTime dueBefore = NepalDate.EndExclusiveUtc(today);
            q = q.Where(c => !Final.Contains(c.Status) && c.ChequeDateUtc < dueBefore);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // ToUpper().Contains translates to upper(..) LIKE on Npgsql and also runs on the InMemory provider.
            string term = query.Search.Trim().ToUpperInvariant();
#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
            q = q.Where(c => c.PartyName.ToUpper().Contains(term) || c.ChequeNumber.ToUpper().Contains(term));
#pragma warning restore CA1304, CA1311, CA1862
        }

        var branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        if (branchId is { } scopedBranchId)
        {
            q = q.Where(c => c.BranchId == scopedBranchId || c.BranchId == null);
        }

        q = q.OrderBy(c => c.ChequeDateUtc).ThenBy(c => c.CreatedAtUtc).ThenBy(c => c.Id);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var rows = await q
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<ChequeDto>
        {
            Items = rows.Select(c => ChequeRegister.ToDto(c, withHistory: false)).ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
