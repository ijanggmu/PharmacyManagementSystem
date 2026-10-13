using FSH.Framework.Persistence;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Identity.Contracts.v1.Approvals;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Identity.Features.v1.Approvals.SearchApprovals;

public sealed class SearchApprovalsQueryHandler(IdentityDbContext dbContext, TimeProvider timeProvider)
    : IQueryHandler<SearchApprovalsQuery, PagedResponse<ApprovalLogEntryDto>>
{
    public async ValueTask<PagedResponse<ApprovalLogEntryDto>> Handle(SearchApprovalsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        IQueryable<ApprovalGrant> grants = dbContext.ApprovalGrants.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.Action))
        {
            string action = query.Action.Trim();
            grants = grants.Where(g => g.Action == action);
        }

        if (query.FromUtc is { } from)
        {
            grants = grants.Where(g => g.CreatedAtUtc >= from);
        }

        if (query.ToUtc is { } to)
        {
            grants = grants.Where(g => g.CreatedAtUtc <= to);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
#pragma warning disable CA1304, CA1311, CA1862 // ToLower() is translated to SQL lower(); culture overloads aren't.
            string term = query.Search.Trim().ToLower();
            grants = grants.Where(g =>
                (g.ApproverName != null && g.ApproverName.ToLower().Contains(term))
                || (g.RequestedByName != null && g.RequestedByName.ToLower().Contains(term))
                || (g.TargetRef != null && g.TargetRef.ToLower().Contains(term)));
#pragma warning restore CA1304, CA1311, CA1862
        }

        DateTime now = timeProvider.GetUtcNow().UtcDateTime;
        var page = await grants
            .OrderByDescending(g => g.CreatedAtUtc)
            .Select(g => new ApprovalLogEntryDto(
                g.Id,
                g.Action,
                g.Amount,
                g.TargetRef,
                g.Reason,
                g.RequestedByUserId,
                g.RequestedByName,
                g.ApproverUserId,
                g.ApproverName,
                g.CreatedAtUtc,
                g.ExpiresAtUtc,
                g.UsedAtUtc,
                string.Empty))
            .ToPagedResponseAsync(query, cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<ApprovalLogEntryDto>
        {
            Items = page.Items.Select(e => e with { Status = ApprovalGrant.StatusOf(e.UsedAtUtc, e.ExpiresAtUtc, now) }).ToList(),
            PageNumber = page.PageNumber,
            PageSize = page.PageSize,
            TotalCount = page.TotalCount,
            TotalPages = page.TotalPages,
        };
    }
}
