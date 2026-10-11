using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Persistence;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.GetIntegrationEvents;
using FSH.Modules.Auditing.Features.v1.Common;
using FSH.Modules.Identity.Contracts.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Auditing.Features.v1.GetIntegrationEvents;

/// <summary>
/// Read-only admin query over the transactional outbox. The outbox is a global table
/// (<c>IGlobalEntity</c>) so it is not tenant-filtered by Finbuckle; this handler therefore scopes
/// rows to the caller's tenant explicitly, and only widens to another tenant (or <c>*</c> = all)
/// with <c>Permissions.AuditTrails.ViewCrossTenant</c>. It never writes to the table.
/// </summary>
public sealed class GetIntegrationEventsQueryHandler : IQueryHandler<GetIntegrationEventsQuery, PagedResponse<IntegrationEventLogDto>>
{
    /// <summary>Same bounded-window guard as the entity audit trail query — keeps the scan bounded.</summary>
    public static readonly TimeSpan MaxWindow = TimeSpan.FromDays(90);

    public static readonly TimeSpan DefaultWindow = TimeSpan.FromDays(7);

    private readonly EventingDbContext _dbContext;
    private readonly ICurrentUser _currentUser;
    private readonly IUserPermissionService _permissions;
    private readonly TimeProvider _timeProvider;

    public GetIntegrationEventsQueryHandler(
        EventingDbContext dbContext,
        ICurrentUser currentUser,
        IUserPermissionService permissions,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _currentUser = currentUser;
        _permissions = permissions;
        _timeProvider = timeProvider;
    }

    public async ValueTask<PagedResponse<IntegrationEventLogDto>> Handle(GetIntegrationEventsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var (fromUtc, toUtc) = ResolveWindow(query.FromUtc, query.ToUtc);

        var messages = _dbContext.OutboxMessages
            .AsNoTracking()
            .IgnoreQueryFilters()
            .Where(m => m.CreatedOnUtc >= fromUtc && m.CreatedOnUtc <= toUtc);

        var tenant = await AuditTenantScope
            .ResolveAsync(_currentUser, _permissions, query.TenantId, cancellationToken)
            .ConfigureAwait(false);
        if (!tenant.AllTenants)
        {
            var tenantId = tenant.TenantId;
            messages = messages.Where(m => m.TenantId == tenantId);
        }

        if (!string.IsNullOrWhiteSpace(query.Type))
        {
            messages = messages.Where(m => EF.Functions.ILike(m.Type, $"%{query.Type}%"));
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string term = query.Search;
            messages = messages.Where(m =>
                EF.Functions.ILike(m.Type, $"%{term}%") ||
                (m.CorrelationId != null && EF.Functions.ILike(m.CorrelationId, $"%{term}%")) ||
                (m.LastError != null && EF.Functions.ILike(m.LastError, $"%{term}%")));
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            messages = query.Status.Trim().ToUpperInvariant() switch
            {
                "DEAD" => messages.Where(m => m.IsDead),
                "PROCESSED" => messages.Where(m => !m.IsDead && m.ProcessedOnUtc != null),
                "FAILED" => messages.Where(m => !m.IsDead && m.ProcessedOnUtc == null && m.LastError != null),
                "PENDING" => messages.Where(m => !m.IsDead && m.ProcessedOnUtc == null && m.LastError == null),
                _ => messages
            };
        }

        messages = messages.OrderByDescending(m => m.CreatedOnUtc);

        var projected = messages.Select(m => new IntegrationEventLogDto
        {
            Id = m.Id,
            CreatedOnUtc = m.CreatedOnUtc,
            Type = m.Type,
            ShortType = string.Empty,
            TenantId = m.TenantId,
            CorrelationId = m.CorrelationId,
            ProcessedOnUtc = m.ProcessedOnUtc,
            RetryCount = m.RetryCount,
            LastError = m.LastError,
            IsDead = m.IsDead,
            NextRetryAt = m.NextRetryAt,
            ClaimedUntilUtc = m.ClaimedUntilUtc,
            ClaimedBy = m.ClaimedBy,
            Status = string.Empty
        });

        var page = await projected.ToPagedResponseAsync(query, cancellationToken).ConfigureAwait(false);

        foreach (var item in page.Items)
        {
            item.Status = DeriveStatus(item);
            item.ShortType = ClrTypeNames.ToShortName(item.Type);
            item.Module = ClrTypeNames.ModuleOf(item.Type);
        }

        return page;
    }

    private static string DeriveStatus(IntegrationEventLogDto item) =>
        DeriveStatus(item.IsDead, item.ProcessedOnUtc, item.LastError);

    /// <summary>Processed, Dead, Failed (has an error, awaiting retry) or Pending.</summary>
    public static string DeriveStatus(bool isDead, DateTime? processedOnUtc, string? lastError)
    {
        if (isDead)
        {
            return "Dead";
        }

        if (processedOnUtc != null)
        {
            return "Processed";
        }

        return lastError != null ? "Failed" : "Pending";
    }

    private (DateTime FromUtc, DateTime ToUtc) ResolveWindow(DateTime? from, DateTime? to)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var resolvedTo = to ?? now;
        var resolvedFrom = from ?? resolvedTo - DefaultWindow;

        if (resolvedTo - resolvedFrom > MaxWindow)
        {
            resolvedFrom = resolvedTo - MaxWindow;
        }

        return (resolvedFrom, resolvedTo);
    }
}
