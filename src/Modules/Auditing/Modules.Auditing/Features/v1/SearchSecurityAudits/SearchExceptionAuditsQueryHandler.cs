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

public sealed class SearchExceptionAuditsQueryHandler : IQueryHandler<SearchExceptionAuditsQuery, PagedResponse<ExceptionAuditSummaryDto>>
{
    private const string LikeEscape = "\\";

    private readonly AuditDbContext _dbContext;
    private readonly ICurrentUser _currentUser;
    private readonly IUserPermissionService _permissions;
    private readonly TimeProvider _timeProvider;

    public SearchExceptionAuditsQueryHandler(
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

    public async ValueTask<PagedResponse<ExceptionAuditSummaryDto>> Handle(SearchExceptionAuditsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var (fromUtc, toUtc) = AuditTenantScope.ResolveWindow(
            query.FromUtc, query.ToUtc, SearchSecurityAuditsQueryHandler.DefaultWindow, SearchSecurityAuditsQueryHandler.MaxWindow, _timeProvider);

        var audits = await AuditTenantScope
            .AuditRecordsAsync(_dbContext, _currentUser, _permissions, query.TenantId, cancellationToken)
            .ConfigureAwait(false);

        audits = audits.Where(a =>
            a.EventType == (int)AuditEventType.Exception
            && a.OccurredAtUtc >= fromUtc
            && a.OccurredAtUtc <= toUtc);

        if (query.Severity.HasValue)
        {
            var severity = (byte)query.Severity.Value;
            audits = audits.Where(a => a.Severity == severity);
        }

        if (query.Area.HasValue && query.Area.Value != ExceptionArea.None)
        {
            var area = query.Area.Value.ToString();
            audits = audits.Where(a => JsonText(a.PayloadJson, "area") == area);
        }

        if (!string.IsNullOrWhiteSpace(query.ExceptionType))
        {
            var pattern = $"%{GetActivityAuditsQueryHandler.EscapeLike(query.ExceptionType.Trim())}%";
            audits = audits.Where(a => EF.Functions.ILike(JsonText(a.PayloadJson, "exceptionType")!, pattern, LikeEscape));
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = $"%{GetActivityAuditsQueryHandler.EscapeLike(query.Search.Trim())}%";
            audits = audits.Where(a =>
                EF.Functions.ILike(JsonText(a.PayloadJson, "message")!, pattern, LikeEscape)
                || EF.Functions.ILike(JsonText(a.PayloadJson, "exceptionType")!, pattern, LikeEscape)
                || EF.Functions.ILike(JsonText(a.PayloadJson, "routeOrLocation")!, pattern, LikeEscape)
                || (a.UserName != null && EF.Functions.ILike(a.UserName, pattern, LikeEscape)));
        }

        var projected = audits
            .OrderByDescending(a => a.OccurredAtUtc)
            .Select(a => new ExceptionAuditSummaryDto
            {
                Id = a.Id,
                OccurredAtUtc = a.OccurredAtUtc,
                Severity = (AuditSeverity)a.Severity,
                TenantId = a.TenantId,
                UserId = a.UserId,
                UserName = a.UserName,
                TraceId = a.TraceId,
                CorrelationId = a.CorrelationId,
                RequestId = a.RequestId,
                Source = a.Source,
                Area = JsonText(a.PayloadJson, "area"),
                ExceptionType = JsonText(a.PayloadJson, "exceptionType"),
                Message = JsonText(a.PayloadJson, "message"),
                RouteOrLocation = JsonText(a.PayloadJson, "routeOrLocation"),
            });

        return await projected.ToPagedResponseAsync(query, cancellationToken).ConfigureAwait(false);
    }
}
