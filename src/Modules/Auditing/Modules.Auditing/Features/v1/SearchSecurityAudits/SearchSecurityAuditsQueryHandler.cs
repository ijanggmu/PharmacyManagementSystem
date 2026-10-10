using FSH.Framework.Core.Context;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.SearchSecurityAudits;
using FSH.Modules.Auditing.Features.v1.GetActivityAudits;
using FSH.Modules.Auditing.Features.v1.Common;
using FSH.Modules.Auditing.Persistence;
using FSH.Modules.Identity.Contracts.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using static FSH.Modules.Auditing.Persistence.AuditJsonbFunctions;

namespace FSH.Modules.Auditing.Features.v1.SearchSecurityAudits;

public sealed class SearchSecurityAuditsQueryHandler : IQueryHandler<SearchSecurityAuditsQuery, PagedResponse<SecurityAuditSummaryDto>>
{
    public static readonly TimeSpan MaxWindow = TimeSpan.FromDays(90);
    public static readonly TimeSpan DefaultWindow = TimeSpan.FromDays(7);

    private const string LikeEscape = "\\";

    private readonly AuditDbContext _dbContext;
    private readonly ICurrentUser _currentUser;
    private readonly IUserPermissionService _permissions;
    private readonly TimeProvider _timeProvider;

    public SearchSecurityAuditsQueryHandler(
        AuditDbContext dbContext,
        ICurrentUser currentUser,
        IUserPermissionService permissions,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _currentUser = currentUser;
        _permissions = permissions;
        _timeProvider = timeProvider;
    }

    public async ValueTask<PagedResponse<SecurityAuditSummaryDto>> Handle(SearchSecurityAuditsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var (fromUtc, toUtc) = AuditTenantScope.ResolveWindow(query.FromUtc, query.ToUtc, DefaultWindow, MaxWindow, _timeProvider);

        var audits = await AuditTenantScope
            .AuditRecordsAsync(_dbContext, _currentUser, _permissions, query.TenantId, cancellationToken)
            .ConfigureAwait(false);

        audits = audits.Where(a =>
            a.EventType == (int)AuditEventType.Security
            && a.OccurredAtUtc >= fromUtc
            && a.OccurredAtUtc <= toUtc);

        if (query.Action.HasValue && query.Action.Value != SecurityAction.None)
        {
            var action = query.Action.Value.ToString();
            audits = audits.Where(a => JsonText(a.PayloadJson, "action") == action);
        }

        if (query.Severity.HasValue)
        {
            var severity = (byte)query.Severity.Value;
            audits = audits.Where(a => a.Severity == severity);
        }

        if (!string.IsNullOrWhiteSpace(query.UserId))
        {
            audits = audits.Where(a => a.UserId == query.UserId);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            var pattern = $"%{GetActivityAuditsQueryHandler.EscapeLike(term)}%";
            audits = audits.Where(a =>
                (a.UserName != null && EF.Functions.ILike(a.UserName, pattern, LikeEscape))
                || EF.Functions.ILike(JsonText(a.PayloadJson, "reasonCode")!, pattern, LikeEscape)
                || JsonText(a.PayloadJson, "claimsSnapshot", "ip") == term
                || a.UserId == term);
        }

        var projected = audits
            .OrderByDescending(a => a.OccurredAtUtc)
            .Select(a => new SecurityAuditSummaryDto
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
                Tags = (AuditTag)a.Tags,
                Action = JsonText(a.PayloadJson, "action"),
                ReasonCode = JsonText(a.PayloadJson, "reasonCode"),
                AuthMethod = JsonText(a.PayloadJson, "authMethod"),
                Ip = JsonText(a.PayloadJson, "claimsSnapshot", "ip"),
                UserAgent = JsonText(a.PayloadJson, "claimsSnapshot", "userAgent"),
            });

        return await projected.ToPagedResponseAsync(query, cancellationToken).ConfigureAwait(false);
    }
}
