using FSH.Framework.Core.Exceptions;
using FSH.Modules.Tickets.Authorization;
using FSH.Modules.Tickets.Contracts.Authorization;
using FSH.Modules.Tickets.Contracts.v1.Tickets;
using FSH.Modules.Tickets.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Tickets.Features.v1.Tickets.ReopenTicket;

public sealed class ReopenTicketCommandHandler(TicketsDbContext dbContext, TicketAccess access)
    : ICommandHandler<ReopenTicketCommand, Guid>
{
    public async ValueTask<Guid> Handle(ReopenTicketCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var ticket = await dbContext.Tickets
            .FirstOrDefaultAsync(t => t.Id == command.TicketId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Ticket {command.TicketId} not found.");

        // A reporter may reopen their own resolved/closed ticket (the problem came back); anyone else needs ViewAll + Reopen.
        await access.EnsureCanActAsync(ticket.Id, ticket.ReporterUserId, TicketsPermissions.Tickets.Reopen, cancellationToken)
            .ConfigureAwait(false);

        ticket.Reopen();
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return ticket.Id;
    }
}
