using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Approvals;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Approvals;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using FSH.Modules.Identity.Services.Approvals;
using Mediator;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Identity.Features.v1.Approvals.IssueApproval;

/// <summary>
/// Issues a manager approval. The approver proves presence by re-entering their own password at the requester's
/// screen. Failed attempts never touch the approver's sign-in lockout (any signed-in user could otherwise lock the
/// owner out); instead <see cref="ApprovalAttemptThrottle"/> limits failures per requester and per requester +
/// approver (429), and the endpoint sits on the strict "auth" rate limit. Unknown approver, wrong password and an
/// approver without <see cref="IdentityPermissions.Approvals.Approve"/> all get the same answer, so the dialog
/// reveals nothing about accounts. The approver can't approve their own request. The response's token is returned
/// once; only its SHA-256 is stored, with who/what/when (the log).
/// </summary>
public sealed partial class IssueApprovalCommandHandler(
    UserManager<FshUser> userManager,
    IdentityDbContext dbContext,
    ICurrentUser currentUser,
    IUserPermissionService userPermissions,
    TimeProvider timeProvider,
    ILogger<IssueApprovalCommandHandler> logger,
    ApprovalAttemptThrottle throttle) : ICommandHandler<IssueApprovalCommand, IssueApprovalResponse>
{
    internal const string InvalidCredentialsMessage = "The approver's email or password is incorrect.";

    internal const string TooManyAttemptsMessage =
        "Too many wrong approver passwords. Wait 15 minutes and try again, or ask the approver to sign in and approve.";

    public async ValueTask<IssueApprovalResponse> Handle(IssueApprovalCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        Guid requesterGuid = currentUser.GetUserId();
        if (requesterGuid == Guid.Empty)
        {
            throw new UnauthorizedException("no current user");
        }

        string requesterId = requesterGuid.ToString();
        string login = command.ApproverLogin.Trim();
        string tenantId = currentUser.GetTenant() ?? string.Empty;

        if (await throttle.IsBlockedAsync(tenantId, requesterId, login, cancellationToken).ConfigureAwait(false))
        {
            LogApprovalDenied(logger, command.Action, requesterId, "too many failed approval attempts");
            throw new CustomException(TooManyAttemptsMessage, (IEnumerable<string>?)null, HttpStatusCode.TooManyRequests);
        }

        FshUser? approver = await userManager.FindByEmailAsync(login).ConfigureAwait(false)
            ?? await userManager.FindByNameAsync(login).ConfigureAwait(false);
        if (approver is null || !approver.IsActive)
        {
            throw await RefuseAsync(command.Action, requesterId, tenantId, login, "unknown or inactive approver", cancellationToken).ConfigureAwait(false);
        }

        // Permission before password: an approver who can't approve gets the same answer as a wrong password, so
        // the dialog can neither confirm who may approve nor be used to test a non-approver's password.
        if (!await userPermissions.HasPermissionAsync(approver.Id, IdentityPermissions.Approvals.Approve, cancellationToken).ConfigureAwait(false))
        {
            throw await RefuseAsync(command.Action, requesterId, tenantId, login, "approver lacks the Approve permission", cancellationToken).ConfigureAwait(false);
        }

        // A sign-in lockout (from failed logins, never from approvals) still keeps the account from approving.
        if (userManager.SupportsUserLockout && await userManager.IsLockedOutAsync(approver).ConfigureAwait(false))
        {
            LogApprovalDenied(logger, command.Action, requesterId, "approver locked out");
            throw new CustomException(
                "This approver's account is temporarily locked after too many wrong sign-in passwords. Try again later or ask another approver.",
                (IEnumerable<string>?)null,
                HttpStatusCode.Locked);
        }

        // Deliberately no AccessFailedAsync / ResetAccessFailedCountAsync: approvals leave the sign-in counter alone.
        if (!await userManager.CheckPasswordAsync(approver, command.Password).ConfigureAwait(false))
        {
            throw await RefuseAsync(command.Action, requesterId, tenantId, login, "wrong approver password", cancellationToken).ConfigureAwait(false);
        }

        if (string.Equals(approver.Id, requesterId, StringComparison.Ordinal))
        {
            LogApprovalDenied(logger, command.Action, requesterId, "self-approval");
            throw new CustomException(
                "Someone else has to approve this — you can't approve your own request.",
                (IEnumerable<string>?)null,
                HttpStatusCode.BadRequest);
        }

        await throttle.ResetPairAsync(tenantId, requesterId, login, cancellationToken).ConfigureAwait(false);

        string token = ApprovalTokens.Generate();
        var grant = ApprovalGrant.Issue(
            ApprovalTokens.Hash(token),
            command.Action,
            decimal.Round(command.Amount, 2, MidpointRounding.AwayFromZero),
            ApprovalRequirement.NormalizeTarget(command.TargetRef),
            command.Reason,
            requesterId,
            currentUser.Name,
            approver.Id,
            DisplayName(approver),
            timeProvider.GetUtcNow().UtcDateTime,
            ApprovalTokens.Lifetime);

        dbContext.ApprovalGrants.Add(grant);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        LogApprovalIssued(logger, grant.Id, grant.Action, grant.Amount, grant.TargetRef, requesterId, approver.Id);
        return new IssueApprovalResponse(token, grant.Id, grant.ExpiresAtUtc, grant.ApproverName);
    }

    private static CustomException InvalidCredentials() =>
        new(InvalidCredentialsMessage, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);

    /// <summary>Counts the failure toward the throttle and returns the one generic refusal for the caller to throw.</summary>
    private async Task<CustomException> RefuseAsync(string action, string requesterId, string tenantId, string login, string reason, CancellationToken cancellationToken)
    {
        await throttle.RecordFailureAsync(tenantId, requesterId, login, cancellationToken).ConfigureAwait(false);
        LogApprovalDenied(logger, action, requesterId, reason);
        return InvalidCredentials();
    }

    internal static string DisplayName(FshUser user)
    {
        string name = $"{user.FirstName} {user.LastName}".Trim();
        return name.Length > 0 ? name : user.Email ?? user.UserName ?? user.Id;
    }

    [LoggerMessage(Level = LogLevel.Information,
        Message = "Approval {ApprovalId} issued for {Action} amount {Amount} target {TargetRef}: requested by {RequesterId}, approved by {ApproverId}")]
    private static partial void LogApprovalIssued(
        ILogger logger, Guid approvalId, string action, decimal amount, string? targetRef, string requesterId, string approverId);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "Approval for {Action} requested by {RequesterId} was refused: {Reason}")]
    private static partial void LogApprovalDenied(ILogger logger, string action, string requesterId, string reason);
}
