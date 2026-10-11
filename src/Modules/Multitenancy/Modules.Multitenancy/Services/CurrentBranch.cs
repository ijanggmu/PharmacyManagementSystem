using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Authorization;
using Microsoft.AspNetCore.Http;

namespace FSH.Modules.Multitenancy.Services;

/// <summary>
/// Default <see cref="ICurrentBranch"/> implementation. Registered <c>Scoped</c> in
/// <see cref="FSH.Modules.Multitenancy.MultitenancyModule"/>, so the resolved value — including a
/// "no branch" outcome — is computed at most once per request. See the XML doc on
/// <see cref="ICurrentBranch"/> for the full resolution order and the required-vs-nullable
/// decision this service deliberately does NOT make (that lives in docs/branch-scoping-plan.md,
/// enforced per-entity by the next wave's handlers).
/// </summary>
public sealed class CurrentBranch : ICurrentBranch
{
    /// <summary>Per-request branch override header, per docs/dotnet-migration-plan.md §6.3.</summary>
    public const string HeaderName = "X-Branch-Id";

    private readonly ICurrentUser _currentUser;
    private readonly IUserProfileService _userProfileService;
    private readonly IBranchService _branchService;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IUserPermissionService _userPermissionService;

    private bool _resolved;
    private Guid? _resolvedBranchId;

    private bool _listFilterResolved;
    private Guid? _resolvedListFilterBranchId;

    private bool? _canViewAll;

    public CurrentBranch(
        ICurrentUser currentUser,
        IUserProfileService userProfileService,
        IBranchService branchService,
        IHttpContextAccessor httpContextAccessor,
        IUserPermissionService userPermissionService)
    {
        _currentUser = currentUser;
        _userProfileService = userProfileService;
        _branchService = branchService;
        _httpContextAccessor = httpContextAccessor;
        _userPermissionService = userPermissionService;
    }

    public async Task<Guid?> GetBranchIdAsync(CancellationToken cancellationToken = default)
    {
        if (!_resolved)
        {
            _resolvedBranchId = await ResolveAsync(cancellationToken).ConfigureAwait(false);
            _resolved = true;
        }

        return _resolvedBranchId;
    }

    public async Task<Guid?> GetListFilterBranchIdAsync(CancellationToken cancellationToken = default)
    {
        if (!_listFilterResolved)
        {
            _resolvedListFilterBranchId = await ResolveListFilterAsync(cancellationToken).ConfigureAwait(false);
            _listFilterResolved = true;
        }

        return _resolvedListFilterBranchId;
    }

    private Task<Guid?> ResolveListFilterAsync(CancellationToken cancellationToken) =>
        ResolveListBranchFilterAsync(null, cancellationToken);

    public async Task<Guid?> ResolveListBranchFilterAsync(Guid? requestedBranchId, CancellationToken cancellationToken = default)
    {
        if (await CanViewAllBranchesAsync(cancellationToken).ConfigureAwait(false))
        {
            return requestedBranchId;
        }

        var ownBranchId = await GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        // No branch to confine to (no tenant, or a tenant without branches): keep today's behavior.
        if (ownBranchId is null || requestedBranchId is null || requestedBranchId == ownBranchId)
        {
            return ownBranchId ?? requestedBranchId;
        }

        throw new ForbiddenException(
            "You can only view records for your own branch. Ask an administrator for 'View all branches' access.");
    }

    public async Task<bool> CanViewAllBranchesAsync(CancellationToken cancellationToken = default)
    {
        _canViewAll ??= await CallerHasViewAllBranchesAsync(cancellationToken).ConfigureAwait(false);
        return _canViewAll.Value;
    }

    private async Task<bool> CallerHasViewAllBranchesAsync(CancellationToken cancellationToken)
    {
        if (!_currentUser.IsAuthenticated())
        {
            return false;
        }

        try
        {
            return await _userPermissionService
                .HasPermissionAsync(_currentUser.GetUserId().ToString(), MultitenancyPermissions.Branches.ViewAll, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (UnauthorizedException)
        {
            // No tenant resolved (or user not found in the tenant) — no permission can be proven.
            return false;
        }
    }

    public async Task<Guid> RequireBranchIdAsync(CancellationToken cancellationToken = default)
    {
        var branchId = await GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        return branchId ?? throw new NotFoundException(
            "No branch is selected for the current user, and the current tenant has no branches configured.");
    }

    private async Task<Guid?> ResolveAsync(CancellationToken cancellationToken)
    {
        var headerValue = _httpContextAccessor.HttpContext?.Request.Headers[HeaderName].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(headerValue))
        {
            return await ResolveFromHeaderAsync(headerValue, cancellationToken).ConfigureAwait(false);
        }

        return await ResolveOwnBranchAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>The caller's own branch: persisted selection, else the tenant default. Ignores the header.</summary>
    private async Task<Guid?> ResolveOwnBranchAsync(CancellationToken cancellationToken)
    {
        if (_currentUser.IsAuthenticated())
        {
            var userId = _currentUser.GetUserId().ToString();
            var currentBranchId = await _userProfileService
                .GetCurrentBranchIdAsync(userId, cancellationToken)
                .ConfigureAwait(false);

            if (currentBranchId.HasValue)
            {
                return currentBranchId;
            }
        }

        try
        {
            return await _branchService.GetDefaultBranchIdAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (UnauthorizedException)
        {
            // No tenant resolved for this request (e.g. a root/operator call) — there is no
            // branch catalog to fall back to, so there is no branch to scope to.
            return null;
        }
    }

    private async Task<Guid> ResolveFromHeaderAsync(string headerValue, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(headerValue, out var headerBranchId))
        {
            throw new ForbiddenException($"'{HeaderName}' header is not a valid branch id.");
        }

        bool isValid;
        try
        {
            isValid = await _branchService
                .IsActiveBranchOfCurrentTenantAsync(headerBranchId, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (UnauthorizedException)
        {
            // No tenant resolved — an explicit override can't be validated, so treat it as invalid.
            isValid = false;
        }

        if (!isValid)
        {
            throw new ForbiddenException(
                $"'{HeaderName}' header does not reference an active branch of the current tenant.");
        }

        // Callers without Branches.ViewAll may only name their own branch. Anonymous callers have no
        // assignment, and a caller with no resolvable own branch has nothing to confine to.
        if (_currentUser.IsAuthenticated() && !await CanViewAllBranchesAsync(cancellationToken).ConfigureAwait(false))
        {
            var ownBranchId = await ResolveOwnBranchAsync(cancellationToken).ConfigureAwait(false);
            if (ownBranchId is not null && ownBranchId != headerBranchId)
            {
                throw new ForbiddenException(
                    $"'{HeaderName}' header references a branch you are not assigned to. Ask an administrator for 'View all branches' access.");
            }
        }

        return headerBranchId;
    }
}
