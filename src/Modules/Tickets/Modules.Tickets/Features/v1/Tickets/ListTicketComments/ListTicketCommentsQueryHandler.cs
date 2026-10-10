using FSH.Framework.Core.Exceptions;
using FSH.Modules.Tickets.Authorization;
using FSH.Modules.Tickets.Contracts.Dtos;
using FSH.Modules.Tickets.Contracts.v1.Tickets;
using FSH.Modules.Tickets.Data;
using FSH.Modules.Tickets.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Tickets.Features.v1.Tickets.ListTicketComments;

public sealed class ListTicketCommentsQueryHandler(TicketsDbContext dbContext, TicketAccess access)
    : IQueryHandler<ListTicketCommentsQuery, IReadOnlyList<TicketCommentDto>>
{
    public async ValueTask<IReadOnlyList<TicketCommentDto>> Handle(
        ListTicketCommentsQuery query,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // 404 for a non-existent ticket rather than a misleading empty 200 — this also keeps the
        // endpoint from being used to probe which ticket ids exist. Another user's ticket is a 404
        // too unless the caller holds the tenant-admin view.
        var reporter = await dbContext.Tickets
            .AsNoTracking()
            .Where(t => t.Id == query.TicketId)
            .Select(t => (Guid?)t.ReporterUserId)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Ticket {query.TicketId} not found.");

        await access.EnsureCanViewAsync(query.TicketId, reporter, cancellationToken).ConfigureAwait(false);

        var comments = await dbContext.TicketComments
            .AsNoTracking()
            .Where(c => c.TicketId == query.TicketId)
            .OrderBy(c => c.CreatedAtUtc)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return comments.Select(c => c.ToDto()).ToList();
    }
}
