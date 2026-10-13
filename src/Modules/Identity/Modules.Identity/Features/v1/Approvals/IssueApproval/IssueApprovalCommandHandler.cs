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
/// screen; failures count toward the approver's lockout exactly like a failed login (and the endpoint sits on the
/// strict "auth" rate limit), so the dialog can't be used to guess a password. The approver must be an active
/// user of this tenant holding <see cref="IdentityPermissions.Approvals.Approve"/>, and can't approve their own
/// request. The response's token is returned once; only its SHA-256 is stored, with who/what/when (the log).
/// </summary>
public sealed partial class IssueApprovalCommandHandler(
    UserManager<FshUser> userManager,
    IdentityDbContext dbContext,
    ICurrentUser currentUser,
    IUserPermissionService userPermissions,
    TimeProvider timeProvider,
    ILogger<IssueApprovalCommandHandler> logger) : ICommandHandler<IssueApprovalCommand, IssueApprovalResponse>
{
    internal const string InvalidCredentialsMessage = "The approver's email or password is incorrect.";

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

        FshUser? approver = await userManager.FindByEmailAsync(login).ConfigureAwait(false)
            ?? await userManager.FindByNameAsync(login).ConfigureAwait(false);
        if (approver is null || !approver.IsActive)
        {
            LogApprovalDenied(logger, command.Action, requesterId, "unknown or inactive approver");
            throw InvalidCredentials();
        }

        // Lockout before the password check, like login, so a locked account can't be probed.
        if (userManager.SupportsUserLockout && await userManager.IsLockedOutAsync(approver).ConfigureAwait(false))
        {
            LogApprovalDenied(logger, command.Action, requesterId, "approver locked out");
            throw new CustomException(
                "This approver's account is temporarily locked after too many wrong passwords. Try again later or ask another approver.",
                (IEnumerable<string>?)null,
                HttpStatusCode.Locked);
        }

        if (!await userManager.CheckPasswordAsync(approver, command.Password).ConfigureAwait(false))
        {
            if (userManager.SupportsUserLockout)
            {
                await userManager.AccessFailedAsync(approver).ConfigureAwait(false);
            }

            LogApprovalDenied(logger, command.Action, requesterId, "wrong approver password");
            throw InvalidCredentials();
        }

        if (string.Equals(approver.Id, requesterId, StringComparison.Ordinal))
        {
            LogApprovalDenied(logger, command.Action, requesterId, "self-approval");
            throw new CustomException(
                "Someone else has to approve this — you can't approve your own request.",
                (IEnumerable<string>?)null,
                HttpStatusCode.BadRequest);
        }

        if (!await userPermissions.HasPermissionAsync(approver.Id, IdentityPermissions.Approvals.Approve, cancellationToken).ConfigureAwait(false))
        {
            LogApprovalDenied(logger, command.Action, requesterId, "approver lacks the Approve permission");
            throw new ForbiddenException($"{DisplayName(approver)} isn't allowed to approve this. Ask a manager.");
        }

        if (userManager.SupportsUserLockout && await userManager.GetAccessFailedCountAsync(approver).ConfigureAwait(false) > 0)
        {
            await userManager.ResetAccessFailedCountAsync(approver).ConfigureAwait(false);
        }

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
