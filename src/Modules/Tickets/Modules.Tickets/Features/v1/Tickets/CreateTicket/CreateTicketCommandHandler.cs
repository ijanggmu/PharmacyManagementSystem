using System.Globalization;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Tickets.Authorization;
using FSH.Modules.Tickets.Contracts.Authorization;
using FSH.Modules.Tickets.Contracts.v1.Tickets;
using FSH.Modules.Tickets.Data;
using FSH.Modules.Tickets.Domain;
using Mediator;
using FSH.Framework.Persistence;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Tickets.Features.v1.Tickets.CreateTicket;

public sealed class CreateTicketCommandHandler(
    TicketsDbContext dbContext,
    TicketAccess access)
    : ICommandHandler<CreateTicketCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateTicketCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var reporterId = access.RequireUserId();

        // Any tenant user may report a ticket (Tickets.Create is basic), but pre-assigning it to
        // someone is a support-desk action that needs Tickets.Assign.
        if (command.AssignedToUserId is not null
            && !await access.HasPermissionAsync(TicketsPermissions.Tickets.Assign, cancellationToken).ConfigureAwait(false))
        {
            throw new ForbiddenException("Assigning a ticket requires the Tickets.Assign permission.");
        }

        // Sequential, tenant-scoped ticket numbers (TK-1, …). Count ALL rows incl. soft-deleted so a
        // deleted number isn't reused; racing writers collide on the unique index (→ 409, retryable).
        long count = await dbContext.Tickets
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .LongCountAsync(cancellationToken)
            .ConfigureAwait(false);
        string number = $"TK-{(count + 1).ToString(CultureInfo.InvariantCulture)}";

        var ticket = Ticket.Create(
            number: number,
            title: command.Title,
            description: command.Description,
            priority: command.Priority,
            reporterUserId: reporterId,
            assignedToUserId: command.AssignedToUserId);

        dbContext.Tickets.Add(ticket);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return ticket.Id;
    }
}
