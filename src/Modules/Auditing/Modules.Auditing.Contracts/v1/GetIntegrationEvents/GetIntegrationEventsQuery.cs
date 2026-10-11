using FSH.Framework.Shared.Persistence;
using FSH.Modules.Auditing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Auditing.Contracts.v1.GetIntegrationEvents;

/// <summary>
/// Lists outbox-backed integration events for the admin "Integration Log" view. Read-only —
/// backed by <c>FSH.Framework.Eventing.Outbox.OutboxMessage</c>, which is owned by the protected
/// BuildingBlocks/Eventing project and is queried here, never written to.
/// </summary>
public sealed class GetIntegrationEventsQuery : IPagedQuery, IQuery<PagedResponse<IntegrationEventLogDto>>
{
    public int? PageNumber { get; set; }

    public int? PageSize { get; set; }

    public string? Sort { get; set; }

    public DateTime? FromUtc { get; set; }

    public DateTime? ToUtc { get; set; }

    public string? TenantId { get; set; }

    /// <summary>Filter by the integration event's CLR type name (e.g. "SaleCompletedIntegrationEvent").</summary>
    public string? Type { get; set; }

    /// <summary>Filter by derived status: Pending, Processed, Failed, Dead.</summary>
    public string? Status { get; set; }

    public string? Search { get; set; }
}
