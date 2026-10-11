namespace FSH.Modules.Tickets.Contracts.Dtos;

/// <summary>
/// Read-side projection of a ticket. Includes resolution metadata
/// (resolvedAt, resolutionNote) when the ticket has been resolved at
/// least once. Comments are returned via the dedicated
/// `/tickets/{id}/comments` endpoint to keep this DTO small.
/// </summary>
public sealed record TicketDto(
    Guid Id,
    string Number,
    string Title,
    string? Description,
    TicketStatus Status,
    TicketPriority Priority,
    Guid ReporterUserId,
    Guid? AssignedToUserId,
    string? ResolutionNote,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc,
    DateTime? ResolvedAtUtc,
    DateTime? ClosedAtUtc,
    int CommentCount,
    DateTimeOffset? DeletedOnUtc = null,
    string? DeletedBy = null,
    // Owning tenant id. Null for every tenant-scoped read (the caller already knows their own
    // tenant) — only populated by the cross-tenant listing (ListTicketsAcrossTenantsQuery), where
    // a single page can mix tickets from several tenants.
    string? TenantId = null);
