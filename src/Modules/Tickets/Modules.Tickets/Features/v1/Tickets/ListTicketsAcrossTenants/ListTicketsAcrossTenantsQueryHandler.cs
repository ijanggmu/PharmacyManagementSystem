using FSH.Framework.Shared.Persistence;
using FSH.Modules.Tickets.Contracts.Dtos;
using FSH.Modules.Tickets.Contracts.v1.Tickets;
using FSH.Modules.Tickets.Data;
using FSH.Modules.Tickets.Domain;
using FSH.Modules.Tickets.Features.v1.Tickets.SearchTickets;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Tickets.Features.v1.Tickets.ListTicketsAcrossTenants;

/// <summary>
/// SuperAdmin support-desk listing of tickets across every tenant. Endpoint-gated on
/// TicketsPermissions.Tickets.ViewCrossTenant (root-only — see TicketsPermissions), so by the time
/// this handler runs the caller is already authorized; no additional in-handler permission check is
/// needed (unlike Auditing's GetAuditsQueryHandler, which serves both the tenant-scoped and
/// cross-tenant case from one endpoint and so must decide per-request).
///
/// Tenant-filter-bypass mechanism copied verbatim from the Auditing module's GetAuditsQueryHandler:
/// <c>IgnoreQueryFilters()</c> to drop Finbuckle's ambient tenant filter (and, for Tickets, the
/// soft-delete filter too, since IgnoreQueryFilters() with no arguments drops every global filter),
/// then an explicit predicate re-applies only the filters this listing still wants
/// (not-deleted, and optionally a single TenantId).
/// </summary>
public sealed class ListTicketsAcrossTenantsQueryHandler(TicketsDbContext dbContext)
    : IQueryHandler<ListTicketsAcrossTenantsQuery, PagedResponse<TicketDto>>
{
    public async ValueTask<PagedResponse<TicketDto>> Handle(
        ListTicketsAcrossTenantsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber is null or <= 0 ? 1 : query.PageNumber.Value;
        int size = query.PageSize is null or < 1 or > 200 ? 20 : query.PageSize.Value;

        var q = dbContext.Tickets
            .AsNoTracking()
            .IgnoreQueryFilters()
            .Where(t => !t.IsDeleted);

        if (!string.IsNullOrWhiteSpace(query.TenantId))
        {
            string tenantId = query.TenantId.Trim();
            q = q.Where(t => EF.Property<string>(t, "TenantId") == tenantId);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string pattern = $"%{TicketSearch.EscapeLike(query.Search.Trim())}%";
            q = q.Where(t =>
                EF.Functions.ILike(t.Title, pattern, TicketSearch.LikeEscape) ||
                EF.Functions.ILike(t.Number, pattern, TicketSearch.LikeEscape) ||
                (t.Description != null && EF.Functions.ILike(t.Description, pattern, TicketSearch.LikeEscape)) ||
                EF.Functions.ILike(EF.Property<string>(t, "TenantId"), pattern, TicketSearch.LikeEscape));
        }

        if (query.Status is { } status)
        {
            q = q.Where(t => t.Status == status);
        }

        if (query.Priority is { } priority)
        {
            q = q.Where(t => t.Priority == priority);
        }

        if (query.FromUtc.HasValue)
        {
            q = q.Where(t => t.CreatedAtUtc >= query.FromUtc.Value);
        }

        if (query.ToUtc.HasValue)
        {
            q = q.Where(t => t.CreatedAtUtc <= query.ToUtc.Value);
        }

        q = q.OrderByDescending(t => t.CreatedAtUtc);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);

        var projected = await q
            .Skip((page - 1) * size)
            .Take(size)
            .Select(t => new
            {
                Ticket = t,
                TenantId = EF.Property<string>(t, "TenantId"),
                CommentCount = dbContext.TicketComments
                    .IgnoreQueryFilters()
                    .Count(c => c.TicketId == t.Id),
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<TicketDto>
        {
            Items = projected.Select(p => p.Ticket.ToDto(p.CommentCount, p.TenantId)).ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
