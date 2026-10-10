using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Tickets.Contracts.Authorization;

namespace FSH.Modules.Tickets.Authorization;

/// <summary>
/// Per-request ticket access rules (see <see cref="TicketsPermissions"/> for the model):
/// <list type="bullet">
///   <item>A caller holding <see cref="TicketsPermissions.Tickets.ViewAll"/> is a tenant ticket admin
///   and sees every ticket of their tenant (the Finbuckle tenant filter still applies).</item>
///   <item>Everyone else sees only tickets they reported. Another user's ticket is reported as
///   404 (never 403) so its existence doesn't leak.</item>
///   <item>Reporter-eligible actions (comment, close, reopen) are allowed on the caller's own
///   ticket without the matching admin permission; on someone else's ticket they require
///   ViewAll + that permission.</item>
/// </list>
/// Scoped; the ViewAll lookup is memoised for the request.
/// </summary>
public sealed class TicketAccess(ICurrentUser currentUser, IUserPermissionService permissions)
{
    private bool? _canViewAll;

    /// <summary>The authenticated caller's user id; 401 when there is none.</summary>
    public Guid RequireUserId()
    {
        var userId = currentUser.GetUserId();
        if (userId == Guid.Empty)
        {
            throw new UnauthorizedException("An authenticated user is required.");
        }

        return userId;
    }

    /// <summary>True when the caller holds the given permission.</summary>
    public async ValueTask<bool> HasPermissionAsync(string permission, CancellationToken cancellationToken)
    {
        var userId = RequireUserId();
        return await permissions
            .HasPermissionAsync(userId.ToString(), permission, cancellationToken)
            .ConfigureAwait(false);
    }

    /// <summary>True when the caller may see every ticket of their tenant.</summary>
    public async ValueTask<bool> CanViewAllAsync(CancellationToken cancellationToken)
    {
        _canViewAll ??= await HasPermissionAsync(TicketsPermissions.Tickets.ViewAll, cancellationToken)
            .ConfigureAwait(false);
        return _canViewAll.Value;
    }

    /// <summary>404 unless the caller reported the ticket or is a tenant ticket admin.</summary>
    public async ValueTask EnsureCanViewAsync(Guid ticketId, Guid reporterUserId, CancellationToken cancellationToken)
    {
        if (reporterUserId == RequireUserId())
        {
            return;
        }

        if (!await CanViewAllAsync(cancellationToken).ConfigureAwait(false))
        {
            throw new NotFoundException($"Ticket {ticketId} not found.");
        }
    }

    /// <summary>
    /// Allows a reporter-eligible action: always on the caller's own ticket; on another user's
    /// ticket only for a tenant ticket admin who also holds <paramref name="adminPermission"/>
    /// (404 when the ticket isn't visible to the caller at all, 403 when visible but not permitted).
    /// </summary>
    public async ValueTask EnsureCanActAsync(
        Guid ticketId,
        Guid reporterUserId,
        string adminPermission,
        CancellationToken cancellationToken)
    {
        if (reporterUserId == RequireUserId())
        {
            return;
        }

        await EnsureCanViewAsync(ticketId, reporterUserId, cancellationToken).ConfigureAwait(false);

        if (!await HasPermissionAsync(adminPermission, cancellationToken).ConfigureAwait(false))
        {
            throw new ForbiddenException("You don't have permission to perform this action on another user's ticket.");
        }
    }
}
