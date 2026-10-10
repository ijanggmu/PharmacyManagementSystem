using FSH.Framework.Core.Exceptions;
using FSH.Modules.Tickets.Contracts.Dtos;
using FSH.Modules.Tickets.Contracts.v1.Tickets;
using FSH.Modules.Tickets.Data;
using FSH.Modules.Tickets.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Tickets.Features.v1.Tickets.GetTicketAcrossTenants;

/// <summary>
/// Detail view for the SuperAdmin support desk. The tenant-scoped GetTicketById can't see another
/// tenant's ticket (Finbuckle's query filter hides it → 404), so opening a row from the
/// all-tenants list needs this. Same bypass as ListTicketsAcrossTenantsQueryHandler:
/// IgnoreQueryFilters() drops the tenant AND soft-delete filters, so soft-delete is re-applied.
/// Endpoint-gated on Tickets.ViewCrossTenant (root-only).
/// </summary>
public sealed class GetTicketByIdAcrossTenantsQueryHandler(TicketsDbContext dbContext)
    : IQueryHandler<GetTicketByIdAcrossTenantsQuery, TicketDto>
{
    public async ValueTask<TicketDto> Handle(GetTicketByIdAcrossTenantsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var row = await dbContext.Tickets
            .AsNoTracking()
            .IgnoreQueryFilters()
            .Where(t => t.Id == query.TicketId && !t.IsDeleted)
            .Select(t => new
            {
                Ticket = t,
                TenantId = EF.Property<string>(t, "TenantId"),
                CommentCount = dbContext.TicketComments
                    .IgnoreQueryFilters()
                    .Count(c => c.TicketId == t.Id && !c.IsDeleted),
            })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        if (row is null)
        {
            throw new NotFoundException($"Ticket {query.TicketId} not found.");
        }

        return row.Ticket.ToDto(row.CommentCount, row.TenantId);
    }
}

/// <summary>Comments for any tenant's ticket — see GetTicketByIdAcrossTenantsQueryHandler.</summary>
public sealed class ListTicketCommentsAcrossTenantsQueryHandler(TicketsDbContext dbContext)
    : IQueryHandler<ListTicketCommentsAcrossTenantsQuery, IReadOnlyList<TicketCommentDto>>
{
    public async ValueTask<IReadOnlyList<TicketCommentDto>> Handle(
        ListTicketCommentsAcrossTenantsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        bool exists = await dbContext.Tickets
            .IgnoreQueryFilters()
            .AnyAsync(t => t.Id == query.TicketId && !t.IsDeleted, cancellationToken)
            .ConfigureAwait(false);

        if (!exists)
        {
            throw new NotFoundException($"Ticket {query.TicketId} not found.");
        }

        var comments = await dbContext.TicketComments
            .AsNoTracking()
            .IgnoreQueryFilters()
            .Where(c => c.TicketId == query.TicketId && !c.IsDeleted)
            .OrderBy(c => c.CreatedAtUtc)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return comments.Select(c => c.ToDto()).ToList();
    }
}
