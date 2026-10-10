using Mediator;

namespace FSH.Modules.Notifications.Contracts.v1.Commands;

/// <summary>Soft-delete a single notification owned by the caller.</summary>
public sealed record DeleteNotificationCommand(Guid NotificationId) : ICommand<Unit>;
