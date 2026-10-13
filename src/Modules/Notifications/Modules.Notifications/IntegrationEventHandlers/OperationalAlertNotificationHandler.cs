using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Web.Realtime;
using FSH.Modules.Accounting.Contracts.Alerts;
using FSH.Modules.Accounting.Contracts.Events;
using FSH.Modules.Notifications.Data;
using FSH.Modules.Notifications.Domain;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Notifications.IntegrationEventHandlers;

/// <summary>
/// Turns an <see cref="OperationalAlertRaisedIntegrationEvent"/> (the daily low-stock / expiry / overdue digest)
/// into one bell notification per listed recipient and pushes it live over SignalR. The scan already chose the
/// recipients by permission and branch; this handler only applies <see cref="OperationalAlertDedupe"/> against the
/// recipient's earlier digests, so a re-run scan or a redelivered event never doubles up, and an unchanged list is
/// not repeated every day.
/// </summary>
public sealed class OperationalAlertNotificationHandler(
    NotificationsDbContext db,
    IHubContext<AppHub> hub,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor)
    : IIntegrationEventHandler<OperationalAlertRaisedIntegrationEvent>
{
    public async Task HandleAsync(OperationalAlertRaisedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var ambientTenantId = tenantAccessor.MultiTenantContext.TenantInfo?.Id;
        if (!string.Equals(ambientTenantId, @event.TenantId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Tenant context mismatch handling {nameof(OperationalAlertRaisedIntegrationEvent)}: ambient " +
                $"'{ambientTenantId ?? "(none)"}' != event '{@event.TenantId ?? "(none)"}'.");
        }

        var recipients = (@event.RecipientUserIds ?? [])
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (recipients.Count == 0)
        {
            return;
        }

        // Earlier digests of this category + scope inside the repeat window (soft-deleted ones count too — there is
        // no soft-delete filter on the set — since a user who dismissed a digest has seen it).
        string prefix = OperationalAlertDedupe.Prefix(@event.Category, @event.ScopeKey);
        DateTime since = DateTime.UtcNow.AddDays(-(Math.Max(1, @event.RepeatAfterDays) + 1));
        var earlier = await db.Notifications
            .Where(n => recipients.Contains(n.UserId)
                && n.DedupeKey != null
                && n.DedupeKey.StartsWith(prefix)
                && n.CreatedAtUtc >= since)
            .Select(n => new { n.UserId, n.DedupeKey })
            .ToListAsync(ct)
            .ConfigureAwait(false);
        var earlierByUser = earlier.ToLookup(x => x.UserId, x => x.DedupeKey!, StringComparer.Ordinal);

        string dedupeKey = OperationalAlertDedupe.Key(@event.Category, @event.ScopeKey, @event.AlertDate, @event.Signature);
        var notifications = recipients
            .Where(userId => !OperationalAlertDedupe.IsSuppressed(
                earlierByUser[userId], @event.Category, @event.ScopeKey, @event.AlertDate, @event.Signature, @event.RepeatAfterDays))
            .Select(userId => Notification.Create(
                userId: userId,
                type: OperationalAlertCategories.NotificationType(@event.Category),
                title: @event.Title,
                body: @event.Body,
                link: @event.Link,
                source: @event.Source,
                metadata: new { category = @event.Category, scope = @event.ScopeKey, alertDate = @event.AlertDate, itemCount = @event.ItemCount },
                dedupeKey: dedupeKey))
            .ToList();
        if (notifications.Count == 0)
        {
            return;
        }

        db.Notifications.AddRange(notifications);
        await db.SaveChangesAsync(ct).ConfigureAwait(false);

        foreach (var n in notifications)
        {
            await hub.Clients.Group($"user:{n.UserId}")
                .SendAsync("NotificationCreated", new
                {
                    id = n.Id,
                    type = n.Type,
                    title = n.Title,
                    body = n.Body,
                    link = n.Link,
                    source = n.Source,
                    createdAtUtc = n.CreatedAtUtc,
                }, ct)
                .ConfigureAwait(false);
        }
    }
}
