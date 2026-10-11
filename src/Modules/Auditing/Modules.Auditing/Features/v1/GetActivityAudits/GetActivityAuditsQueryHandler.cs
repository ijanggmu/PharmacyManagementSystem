using FSH.Framework.Core.Context;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.GetActivityAudits;
using FSH.Modules.Auditing.Features.v1.Common;
using FSH.Modules.Auditing.Persistence;
using FSH.Modules.Identity.Contracts.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using static FSH.Modules.Auditing.Persistence.AuditJsonbFunctions;

namespace FSH.Modules.Auditing.Features.v1.GetActivityAudits;

/// <summary>
/// The "API requests" system log: every HTTP request the audit middleware recorded (successes and,
/// since failed requests now also get an Activity row, 4xx/5xx), projected from the jsonb payload.
/// </summary>
public sealed class GetActivityAuditsQueryHandler : IQueryHandler<GetActivityAuditsQuery, PagedResponse<ActivityAuditSummaryDto>>
{
    public static readonly TimeSpan MaxWindow = TimeSpan.FromDays(90);
    public static readonly TimeSpan DefaultWindow = TimeSpan.FromHours(24);

    private const string LikeEscape = "\\";

    private readonly AuditDbContext _dbContext;
    private readonly ICurrentUser _currentUser;
    private readonly IUserPermissionService _permissions;
    private readonly TimeProvider _timeProvider;

    public GetActivityAuditsQueryHandler(
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

    public async ValueTask<PagedResponse<ActivityAuditSummaryDto>> Handle(GetActivityAuditsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var (fromUtc, toUtc) = AuditTenantScope.ResolveWindow(query.FromUtc, query.ToUtc, DefaultWindow, MaxWindow, _timeProvider);

        var audits = await AuditTenantScope
            .AuditRecordsAsync(_dbContext, _currentUser, _permissions, query.TenantId, cancellationToken)
            .ConfigureAwait(false);

        audits = audits.Where(a =>
            a.EventType == (int)AuditEventType.Activity
            && a.OccurredAtUtc >= fromUtc
            && a.OccurredAtUtc <= toUtc);

        audits = ApplyFilters(audits, query);

        var projected = audits
            .OrderByDescending(a => a.OccurredAtUtc)
            .Select(a => new ActivityAuditSummaryDto
            {
                Id = a.Id,
                OccurredAtUtc = a.OccurredAtUtc,
                Severity = (AuditSeverity)a.Severity,
                TenantId = a.TenantId,
                UserId = a.UserId,
                UserName = a.UserName,
                Method = JsonText(a.PayloadJson, "method"),
                Path = JsonText(a.PayloadJson, "name"),
                QueryString = JsonText(a.PayloadJson, "queryString"),
                RouteTemplate = JsonText(a.PayloadJson, "routeTemplate"),
                StatusCode = JsonInt(a.PayloadJson, "statusCode"),
                DurationMs = JsonInt(a.PayloadJson, "durationMs"),
                Source = a.Source,
                ClientIp = JsonText(a.PayloadJson, "clientIp"),
                ErrorType = JsonText(a.PayloadJson, "errorType"),
                CorrelationId = a.CorrelationId,
                TraceId = a.TraceId,
            });

        return await projected.ToPagedResponseAsync(query, cancellationToken).ConfigureAwait(false);
    }

    private static IQueryable<AuditRecord> ApplyFilters(IQueryable<AuditRecord> audits, GetActivityAuditsQuery query)
    {
        if (!string.IsNullOrWhiteSpace(query.Method))
        {
            var method = query.Method.Trim().ToUpperInvariant();
            audits = audits.Where(a => JsonText(a.PayloadJson, "method") == method);
        }

        if (query.StatusCode.HasValue)
        {
            var code = query.StatusCode.Value;
            audits = audits.Where(a => JsonInt(a.PayloadJson, "statusCode") == code);
        }
        else if (StatusClassRange(query.StatusClass) is { } range)
        {
            var (min, max) = range;
            audits = audits.Where(a =>
                JsonInt(a.PayloadJson, "statusCode") >= min && JsonInt(a.PayloadJson, "statusCode") <= max);
        }

        if (!string.IsNullOrWhiteSpace(query.PathContains))
        {
            var pattern = $"%{EscapeLike(query.PathContains.Trim())}%";
            audits = audits.Where(a => EF.Functions.ILike(JsonText(a.PayloadJson, "name")!, pattern, LikeEscape));
        }

        if (!string.IsNullOrWhiteSpace(query.UserId))
        {
            audits = audits.Where(a => a.UserId == query.UserId);
        }

        if (!string.IsNullOrWhiteSpace(query.CorrelationId))
        {
            audits = audits.Where(a => a.CorrelationId == query.CorrelationId);
        }

        if (query.MinDurationMs is > 0)
        {
            var min = query.MinDurationMs.Value;
            audits = audits.Where(a => JsonInt(a.PayloadJson, "durationMs") >= min);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = $"%{EscapeLike(query.Search.Trim())}%";
            audits = audits.Where(a =>
                EF.Functions.ILike(JsonText(a.PayloadJson, "name")!, pattern, LikeEscape)
                || (a.UserName != null && EF.Functions.ILike(a.UserName, pattern, LikeEscape))
                || (a.Source != null && EF.Functions.ILike(a.Source, pattern, LikeEscape))
                || JsonText(a.PayloadJson, "clientIp") == query.Search.Trim());
        }

        return audits;
    }

    /// <summary>Maps "2xx"/"4xx"/"error"… to an inclusive status range, or null when unset/unknown.</summary>
    public static (int Min, int Max)? StatusClassRange(string? statusClass)
    {
        if (string.IsNullOrWhiteSpace(statusClass))
        {
            return null;
        }

        return statusClass.Trim().ToUpperInvariant() switch
        {
            "1XX" => (100, 199),
            "2XX" => (200, 299),
            "3XX" => (300, 399),
            "4XX" => (400, 499),
            "5XX" => (500, 599),
            "ERROR" => (400, 599),
            _ => null,
        };
    }

    internal static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);
}
