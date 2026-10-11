using FSH.Modules.Tickets.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Tickets.Contracts.v1.Tickets;

/// <summary>SuperAdmin read of any tenant's ticket (the TenantId on the DTO is populated).</summary>
public sealed record GetTicketByIdAcrossTenantsQuery(Guid TicketId) : IQuery<TicketDto>;

/// <summary>SuperAdmin read of any tenant's ticket comments, oldest first.</summary>
public sealed record ListTicketCommentsAcrossTenantsQuery(Guid TicketId) : IQuery<IReadOnlyList<TicketCommentDto>>;
