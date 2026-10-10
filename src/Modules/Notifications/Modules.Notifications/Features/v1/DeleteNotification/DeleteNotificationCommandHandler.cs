using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Notifications.Contracts.v1.Commands;
using FSH.Modules.Notifications.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Notifications.Features.v1.DeleteNotification;

public sealed class DeleteNotificationCommandHandler(
    NotificationsDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<DeleteNotificationCommand, Unit>
{
    public async ValueTask<Unit> Handle(DeleteNotificationCommand cmd, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(cmd);
        var userId = currentUser.GetUserId();
        if (userId == Guid.Empty) throw new UnauthorizedException("no current user");
        var currentUserId = userId.ToString();

        // Caller-scoped, same pattern as MarkNotificationReadCommandHandler: filter by (Id, UserId,
        // not-already-deleted) so users can only soft-delete their own, still-visible rows. 404 if the
        // row exists but belongs to someone else or was already deleted — we don't leak existence.
        var notification = await db.Notifications
            .FirstOrDefaultAsync(n => n.Id == cmd.NotificationId && n.UserId == currentUserId && n.DeletedAtUtc == null, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException("Notification not found.");

        notification.Delete();
        await db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return Unit.Value;
    }
}
