using FSH.Framework.Core.Context;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.GetAuditsByCorrelation;
using FSH.Modules.Auditing.Features.v1.Common;
using FSH.Modules.Auditing.Persistence;
using FSH.Modules.Identity.Contracts.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Auditing.Features.v1.GetAuditsByCorrelation;

public sealed class GetAuditsByCorrelationQueryHandler : IQueryHandler<GetAuditsByCorrelationQuery, IReadOnlyList<AuditSummaryDto>>
{
    private const int MaxRows = 500;

    private readonly AuditDbContext _dbContext;
    private readonly ICurrentUser _currentUser;
    private readonly IUserPermissionService _permissions;

    public GetAuditsByCorrelationQueryHandler(
        AuditDbContext dbContext,
        ICurrentUser currentUser,
        IUserPermissionService permissions)
    {
        _dbContext = dbContext;
        _currentUser = currentUser;
        _permissions = permissions;
    }

    public async ValueTask<IReadOnlyList<AuditSummaryDto>> Handle(GetAuditsByCorrelationQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var scoped = await AuditTenantScope
            .AuditRecordsAsync(_dbContext, _currentUser, _permissions, query.TenantId, cancellationToken)
            .ConfigureAwait(false);

        IQueryable<AuditRecord> audits = scoped
            .Where(a => a.CorrelationId == query.CorrelationId);

        if (query.FromUtc.HasValue)
        {
            audits = audits.Where(a => a.OccurredAtUtc >= query.FromUtc.Value);
        }

        if (query.ToUtc.HasValue)
        {
            audits = audits.Where(a => a.OccurredAtUtc <= query.ToUtc.Value);
        }

        var list = await audits
            .OrderBy(a => a.OccurredAtUtc)
            .Take(MaxRows)
            .Select(a => new AuditSummaryDto
            {
                Id = a.Id,
                OccurredAtUtc = a.OccurredAtUtc,
                EventType = (AuditEventType)a.EventType,
                Severity = (AuditSeverity)a.Severity,
                TenantId = a.TenantId,
                UserId = a.UserId,
                UserName = a.UserName,
                TraceId = a.TraceId,
                CorrelationId = a.CorrelationId,
                RequestId = a.RequestId,
                Source = a.Source,
                Tags = (AuditTag)a.Tags
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return list;
    }
}