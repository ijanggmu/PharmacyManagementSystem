using FSH.Framework.Core.Context;
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
/// Request KPIs for the system-log header. All aggregates run in SQL over the bounded window;
/// p95 is an ORDER BY / OFFSET probe rather than a percentile function so it stays provider-agnostic.
/// </summary>
public sealed class GetActivityStatsQueryHandler : IQueryHandler<GetActivityStatsQuery, ActivityStatsDto>
{
    public const int DefaultSlowThresholdMs = 1_000;

    private readonly AuditDbContext _dbContext;
    private readonly ICurrentUser _currentUser;
    private readonly IUserPermissionService _permissions;
    private readonly TimeProvider _timeProvider;

    public GetActivityStatsQueryHandler(
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

    public async ValueTask<ActivityStatsDto> Handle(GetActivityStatsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var (fromUtc, toUtc) = AuditTenantScope.ResolveWindow(
            query.FromUtc, query.ToUtc, GetActivityAuditsQueryHandler.DefaultWindow, GetActivityAuditsQueryHandler.MaxWindow, _timeProvider);
        var slow = query.SlowThresholdMs is > 0 ? query.SlowThresholdMs.Value : DefaultSlowThresholdMs;

        var audits = await AuditTenantScope
            .AuditRecordsAsync(_dbContext, _currentUser, _permissions, query.TenantId, cancellationToken)
            .ConfigureAwait(false);

        var scoped = audits.Where(a =>
            a.EventType == (int)AuditEventType.Activity
            && a.OccurredAtUtc >= fromUtc
            && a.OccurredAtUtc <= toUtc);

        var total = await scoped.LongCountAsync(cancellationToken).ConfigureAwait(false);
        if (total == 0)
        {
            return new ActivityStatsDto { FromUtc = fromUtc, ToUtc = toUtc, SlowThresholdMs = slow };
        }

        var clientErrors = await scoped
            .LongCountAsync(a => JsonInt(a.PayloadJson, "statusCode") >= 400 && JsonInt(a.PayloadJson, "statusCode") < 500, cancellationToken)
            .ConfigureAwait(false);
        var serverErrors = await scoped
            .LongCountAsync(a => JsonInt(a.PayloadJson, "statusCode") >= 500, cancellationToken)
            .ConfigureAwait(false);
        var slowRequests = await scoped
            .LongCountAsync(a => JsonInt(a.PayloadJson, "durationMs") >= slow, cancellationToken)
            .ConfigureAwait(false);
        var avg = await scoped
            .Select(a => JsonInt(a.PayloadJson, "durationMs"))
            .AverageAsync(cancellationToken)
            .ConfigureAwait(false);

        var p95Offset = (int)Math.Min(int.MaxValue, Math.Max(0, (long)Math.Ceiling(total * 0.95) - 1));
        var p95 = await scoped
            .Select(a => JsonInt(a.PayloadJson, "durationMs"))
            .OrderBy(d => d)
            .Skip(p95Offset)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return new ActivityStatsDto
        {
            FromUtc = fromUtc,
            ToUtc = toUtc,
            TotalRequests = total,
            ClientErrors = clientErrors,
            ServerErrors = serverErrors,
            SlowRequests = slowRequests,
            SlowThresholdMs = slow,
            AvgDurationMs = avg is null ? null : Math.Round(avg.Value, 1),
            P95DurationMs = p95,
            ErrorRate = Math.Round((clientErrors + serverErrors) / (double)total, 4),
        };
    }
}
