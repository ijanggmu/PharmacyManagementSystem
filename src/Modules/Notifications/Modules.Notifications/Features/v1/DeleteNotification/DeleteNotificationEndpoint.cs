using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Notifications.Contracts.Authorization;
using FSH.Modules.Notifications.Contracts.v1.Commands;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Notifications.Features.v1.DeleteNotification;

public static class DeleteNotificationEndpoint
{
    // Gated by the same permission as reading the inbox (Inbox.View): deleting one's own
    // notification is a self-service inbox action available to anyone who can see their inbox,
    // not an elevated action — there is no separate "delete" permission on this module.
    internal static RouteHandlerBuilder MapDeleteNotificationEndpoint(this IEndpointRouteBuilder endpoints)
        => endpoints.MapDelete("/{id:guid}",
                async (Guid id, IMediator mediator, CancellationToken cancellationToken) =>
                {
                    await mediator.Send(new DeleteNotificationCommand(id), cancellationToken);
                    return Results.NoContent();
                })
            .WithName("DeleteNotification")
            .WithSummary("Soft-delete a single notification owned by the caller")
            .RequirePermission(NotificationPermissions.Inbox.View);
}
