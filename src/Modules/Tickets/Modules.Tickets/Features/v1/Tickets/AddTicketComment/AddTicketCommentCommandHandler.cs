using FSH.Framework.Core.Exceptions;
using FSH.Modules.Tickets.Authorization;
using FSH.Modules.Tickets.Contracts.Authorization;
using FSH.Modules.Tickets.Contracts.v1.Tickets;
using FSH.Modules.Tickets.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Tickets.Features.v1.Tickets.AddTicketComment;

public sealed class AddTicketCommentCommandHandler(
    TicketsDbContext dbContext,
    TicketAccess access)
    : ICommandHandler<AddTicketCommentCommand, Guid>
{
    public async ValueTask<Guid> Handle(AddTicketCommentCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var authorId = access.RequireUserId();

        // Load the Comments collection up front so EF's change tracker detects the new TicketComment
        // (added via the aggregate) as an INSERT rather than missing it during change detection.
        var ticket = await dbContext.Tickets
            .Include(t => t.Comments)
            .FirstOrDefaultAsync(t => t.Id == command.TicketId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Ticket {command.TicketId} not found.");

        // Reporters may always comment on their own ticket; anyone else needs ViewAll + Comment.
        await access.EnsureCanActAsync(ticket.Id, ticket.ReporterUserId, TicketsPermissions.Tickets.Comment, cancellationToken)
            .ConfigureAwait(false);

        var commentId = ticket.AddComment(authorId, command.Body);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return commentId;
    }
}
