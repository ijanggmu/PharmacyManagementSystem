using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Accounting.Contracts.Events;

/// <summary>
/// The daily operational-alerts scan found something an owner or manager should act on — stock at or below its
/// reorder level, batches near expiry, or supplier bills / customer dues past the overdue age — for one category
/// and one branch scope (<see cref="ScopeKey"/>: "all" or a branch id). The Notifications module turns it into one
/// bell notification (a digest) per user in <see cref="RecipientUserIds"/>, applying
/// <see cref="Alerts.OperationalAlertDedupe"/>: at most one digest per category and scope a day, and an unchanged
/// digest (<see cref="Signature"/>) only once every <see cref="RepeatAfterDays"/> days.
/// Recipients are picked by the scan (the users whose permissions and branch let them see the data).
/// </summary>
public sealed record OperationalAlertRaisedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    string Category,
    string ScopeKey,
    DateOnly AlertDate,
    string Signature,
    int RepeatAfterDays,
    string Title,
    string Body,
    string Link,
    int ItemCount,
    IReadOnlyList<string> RecipientUserIds) : IIntegrationEvent;
