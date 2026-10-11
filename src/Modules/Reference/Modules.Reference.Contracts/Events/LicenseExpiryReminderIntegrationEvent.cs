using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Reference.Contracts.Events;

/// <summary>
/// A pharmacy license is about to expire or has expired. Raised by the daily license scan; the
/// Notifications module turns it into an in-app notification for every active user of the tenant
/// holding <see cref="NotifyPermission"/> (the people who can renew it in Settings).
/// </summary>
public sealed record LicenseExpiryReminderIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid LicenseId,
    string LicenseLabel,
    string Number,
    DateOnly ExpiresOn,
    int DaysLeft,
    string NotifyPermission) : IIntegrationEvent;
