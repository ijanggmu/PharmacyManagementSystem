using FSH.Modules.Auditing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Auditing.Contracts.v1.GetAuditsByCorrelation;

public sealed class GetAuditsByCorrelationQuery : IQuery<IReadOnlyList<AuditSummaryDto>>
{
    public string CorrelationId { get; init; } = default!;

    public DateTime? FromUtc { get; init; }

    public DateTime? ToUtc { get; init; }

    /// <summary>Optional tenant (or <c>*</c>) for cross-tenant lookups; requires ViewCrossTenant.</summary>
    public string? TenantId { get; init; }
}