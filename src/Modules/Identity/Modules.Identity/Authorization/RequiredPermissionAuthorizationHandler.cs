using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Shared.Identity.Claims;
using FSH.Modules.Identity.Contracts.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;

namespace FSH.Modules.Identity.Authorization;

public sealed class RequiredPermissionAuthorizationHandler(IUserService userService) : AuthorizationHandler<PermissionAuthorizationRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionAuthorizationRequirement requirement)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(requirement);

        var httpContext = context.Resource as HttpContext;
        var endpoint = context.Resource switch
        {
            HttpContext ctx => ctx.GetEndpoint(),
            Endpoint ep => ep,
            _ => null,
        };

        // IMPORTANT: resolve IRequiredPermissionMetadata from FSH.Framework.Shared.Identity.Authorization (the
        // interface the attribute implements) — a duplicate would silently fail-open every .RequirePermission().
        var requiredPermissions = endpoint?.Metadata.GetMetadata<IRequiredPermissionMetadata>()?.RequiredPermissions;
        if (requiredPermissions == null)
        {
            // there are no permission requirements set by the endpoint
            // hence, authorize requests
            context.Succeed(requirement);
            return;
        }

        var cancellationToken = httpContext?.RequestAborted ?? CancellationToken.None;
        if (context.User?.GetUserId() is not { } userId)
        {
            return;
        }

        // Every declared permission is required (AND semantics). Checking only the first one let an
        // endpoint tagged with several permissions through for callers holding just the first.
        // A present-but-empty set is a misconfiguration: fail closed.
        if (requiredPermissions.Count == 0)
        {
            return;
        }

        foreach (string permission in requiredPermissions)
        {
            if (!await userService.HasPermissionAsync(userId, permission, cancellationToken).ConfigureAwait(false))
            {
                return;
            }
        }

        context.Succeed(requirement);
    }
}