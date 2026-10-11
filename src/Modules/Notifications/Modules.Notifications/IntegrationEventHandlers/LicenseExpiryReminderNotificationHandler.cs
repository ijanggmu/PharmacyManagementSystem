using System.Globalization;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Web.Realtime;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Users.GetUsers;
using FSH.Modules.Notifications.Data;
using FSH.Modules.Notifications.Domain;
using FSH.Modules.Reference.Contracts.Events;
using Mediator;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Notifications.IntegrationEventHandlers;

/// <summary>
/// Turns a <see cref="LicenseExpiryReminderIntegrationEvent"/> into a bell notification for every
/// active user of the tenant who holds the event's permission (those who can renew the license),
/// and pushes it live over SignalR.
/// </summary>
public sealed class LicenseExpiryReminderNotificationHandler(
    NotificationsDbContext db,
    IHubContext<AppHub> hub,
    IMediator mediator,
    IUserPermissionService permissions,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor)
    : IIntegrationEventHandler<LicenseExpiryReminderIntegrationEvent>
{
    public const string NotificationType = "license.expiry";

    public static string TitleFor(string label, int daysLeft) => daysLeft switch
    {
        < 0 => $"{label} expired {-daysLeft} day{(daysLeft == -1 ? "" : "s")} ago",
        0 => $"{label} expires today",
        1 => $"{label} expires tomorrow",
        _ => $"{label} expires in {daysLeft} days",
    };

    /// <summary>The reminder's identity: one license, one expiry date, one day (days left).</summary>
    public static string DedupeKeyFor(LicenseExpiryReminderIntegrationEvent @event)
    {
        ArgumentNullException.ThrowIfNull(@event);
        return string.Create(
            CultureInfo.InvariantCulture,
            $"{NotificationType}:{@event.LicenseId:N}:{@event.ExpiresOn:yyyy-MM-dd}:{@event.DaysLeft}");
    }

    public async Task HandleAsync(LicenseExpiryReminderIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var ambientTenantId = tenantAccessor.MultiTenantContext.TenantInfo?.Id;
        if (!string.Equals(ambientTenantId, @event.TenantId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Tenant context mismatch handling {nameof(LicenseExpiryReminderIntegrationEvent)}: ambient " +
                $"'{ambientTenantId ?? "(none)"}' != event '{@event.TenantId ?? "(none)"}'.");
        }

        var users = await mediator.Send(new GetUsersQuery(), ct).ConfigureAwait(false);
        var recipients = new List<string>();
        foreach (var user in users.Where(u => u.IsActive && !string.IsNullOrEmpty(u.Id)))
        {
            if (await permissions.HasPermissionAsync(user.Id!, @event.NotifyPermission, ct).ConfigureAwait(false))
            {
                recipients.Add(user.Id!);
            }
        }

        // One reminder per license per day per user: the scan job may raise the same reminder again (a
        // retried run, a redelivered event); users who already have it are skipped.
        string dedupeKey = DedupeKeyFor(@event);
        var alreadyNotified = await db.Notifications
            .Where(n => n.DedupeKey == dedupeKey && recipients.Contains(n.UserId))
            .Select(n => n.UserId)
            .ToListAsync(ct)
            .ConfigureAwait(false);
        recipients.RemoveAll(alreadyNotified.Contains);

        if (recipients.Count == 0)
        {
            return;
        }

        string title = TitleFor(@event.LicenseLabel, @event.DaysLeft);
        string body = string.Create(
            CultureInfo.InvariantCulture,
            $"No. {@event.Number}, valid until {@event.ExpiresOn:yyyy-MM-dd}. Renew it and update the expiry in Settings → Licenses.");

        var notifications = recipients
            .Select(userId => Notification.Create(
                userId: userId,
                type: NotificationType,
                title: title,
                body: body,
                link: "/dashboard/settings?tab=profile#licenses",
                source: @event.Source,
                metadata: new { licenseId = @event.LicenseId, expiresOn = @event.ExpiresOn, daysLeft = @event.DaysLeft },
                dedupeKey: dedupeKey))
            .ToList();

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
