using FSH.Modules.Auditing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Auditing.Contracts.v1.GetAuditById;

/// <param name="Id">Audit record id.</param>
/// <param name="TenantId">Optional tenant (or <c>*</c>) for cross-tenant lookups; requires ViewCrossTenant.</param>
public sealed record GetAuditByIdQuery(Guid Id, string? TenantId = null) : IQuery<AuditDetailDto>;