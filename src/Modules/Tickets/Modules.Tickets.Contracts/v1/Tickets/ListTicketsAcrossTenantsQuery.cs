using FSH.Framework.Shared.Persistence;
using FSH.Modules.Tickets.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Tickets.Contracts.v1.Tickets;

/// <summary>
/// SuperAdmin support-desk listing: tickets across every tenant, paged and filterable by tenant,
/// status, priority, a keyword and a created-date range. Gated on
/// TicketsPermissions.Tickets.ViewCrossTenant (root-only) — see
/// FSH.Modules.Tickets.Features.v1.Tickets.ListTicketsAcrossTenants.ListTicketsAcrossTenantsQueryHandler
/// for the Finbuckle tenant-filter-bypass mechanism, copied from the Auditing module's
/// GetAuditsQueryHandler.
/// </summary>
public sealed class ListTicketsAcrossTenantsQuery : IPagedQuery, IQuery<PagedResponse<TicketDto>>
{
    public int? PageNumber { get; set; }

    public int? PageSize { get; set; }

    public string? Sort { get; set; }

    /// <summary>Exact tenant id to filter on. Omitted/null returns tickets from every tenant.</summary>
    public string? TenantId { get; set; }

    /// <summary>
    /// Case-insensitive keyword over title, ticket number, description and tenant id. Applied
    /// server-side so it narrows the whole result set, not just the current page.
    /// </summary>
    public string? Search { get; set; }

    public TicketStatus? Status { get; set; }

    public TicketPriority? Priority { get; set; }

    /// <summary>Inclusive lower bound on Ticket.CreatedAtUtc.</summary>
    public DateTime? FromUtc { get; set; }

    /// <summary>Inclusive upper bound on Ticket.CreatedAtUtc.</summary>
    public DateTime? ToUtc { get; set; }
}
