using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Identity.Contracts.Approvals;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Identity.Services.Approvals;

/// <summary>
/// Redeems manager approvals for guarded actions (see <see cref="IApprovalService"/>). A token is accepted only
/// when it is bound to the current user, the same action and target, covers the amount, is unexpired and unused.
/// Redemption flips <see cref="ApprovalGrant.UsedAtUtc"/> under a concurrency check, so a token can be spent
/// once even under concurrent requests. When the caller already has a transaction open on the scope's shared
/// connection (the sale/refund/re-price transaction), the redemption joins it: if the guarded action rolls back,
/// so does the redemption.
/// </summary>
public sealed partial class ApprovalService(
    IdentityDbContext dbContext,
    AmbientDbTransactionRegistry ambientTransactions,
    ICurrentUser currentUser,
    IUserPermissionService userPermissions,
    TimeProvider timeProvider,
    ILogger<ApprovalService> logger) : IApprovalService
{
    public async Task<ApprovalGrantDto?> AuthorizeAsync(
        ApprovalRequirement requirement,
        IReadOnlyCollection<string>? approvalTokens,
        string? directPermission = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(requirement);

        Guid userId = currentUser.GetUserId();
        if (userId == Guid.Empty)
        {
            throw new UnauthorizedException("no current user");
        }

        string requesterId = userId.ToString();
        if (directPermission is not null
            && await userPermissions.HasPermissionAsync(requesterId, directPermission, cancellationToken).ConfigureAwait(false))
        {
            return null;
        }

        var hashes = (approvalTokens ?? [])
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(ApprovalTokens.Hash)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (hashes.Count == 0)
        {
            throw new ApprovalRequiredException(requirement);
        }

        string? target = ApprovalRequirement.NormalizeTarget(requirement.TargetRef);
        ApprovalGrant? grant = await RedeemAsync(requirement, hashes, requesterId, target, cancellationToken).ConfigureAwait(false);
        if (grant is null)
        {
            LogApprovalRejected(logger, requirement.Action, requesterId, target);
            throw new ApprovalRequiredException(requirement);
        }

        LogApprovalRedeemed(logger, grant.Id, grant.Action, grant.Amount, target, requesterId, grant.ApproverUserId);
        return new ApprovalGrantDto(
            grant.Id, grant.Action, grant.Amount, grant.TargetRef, grant.ApproverUserId, grant.ApproverName, grant.CreatedAtUtc);
    }

    private async Task<ApprovalGrant?> RedeemAsync(
        ApprovalRequirement requirement, List<string> hashes, string requesterId, string? target, CancellationToken cancellationToken)
    {
        ApprovalGrant? redeemed = null;
        await RunInAmbientTransactionAsync(async ct =>
        {
            DateTime now = timeProvider.GetUtcNow().UtcDateTime;
            var candidates = await dbContext.ApprovalGrants
                .Where(g => hashes.Contains(g.TokenHash)
                    && g.Action == requirement.Action
                    && g.RequestedByUserId == requesterId
                    && g.TargetRef == target
                    && g.UsedAtUtc == null
                    && g.ExpiresAtUtc > now)
                .ToListAsync(ct)
                .ConfigureAwait(false);

            // The smallest approval that still covers the amount, so a larger one stays available.
            var grant = candidates
                .Where(g => requirement.IsCoveredBy(g.Amount))
                .OrderBy(g => g.Amount)
                .FirstOrDefault();
            if (grant is null)
            {
                return;
            }

            grant.Redeem(now);
            try
            {
                await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
                redeemed = grant;
            }
            catch (DbUpdateConcurrencyException)
            {
                // Another request redeemed it first.
                dbContext.Entry(grant).State = EntityState.Detached;
            }
        }, cancellationToken).ConfigureAwait(false);

        return redeemed;
    }

    private async Task RunInAmbientTransactionAsync(Func<CancellationToken, Task> work, CancellationToken cancellationToken)
    {
        if (!dbContext.Database.IsRelational() || dbContext.Database.CurrentTransaction is not null)
        {
            await work(cancellationToken).ConfigureAwait(false);
            return;
        }

        var ambient = ambientTransactions.Find(dbContext.Database.GetDbConnection());
        if (ambient is null)
        {
            // No caller transaction: the single conditional UPDATE commits on its own.
            await work(cancellationToken).ConfigureAwait(false);
            return;
        }

        await dbContext.Database.UseTransactionAsync(ambient, cancellationToken).ConfigureAwait(false);
        try
        {
            await work(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            // Leave the caller's transaction to its owner.
            await dbContext.Database.UseTransactionAsync(null, CancellationToken.None).ConfigureAwait(false);
        }
    }

    [LoggerMessage(Level = LogLevel.Information,
        Message = "Approval {ApprovalId} redeemed for {Action} amount {Amount} target {TargetRef} by {RequesterId} (approved by {ApproverId})")]
    private static partial void LogApprovalRedeemed(
        ILogger logger, Guid approvalId, string action, decimal amount, string? targetRef, string requesterId, string approverId);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "Approval token(s) for {Action} rejected for {RequesterId} on target {TargetRef}: wrong binding, too small, expired or already used")]
    private static partial void LogApprovalRejected(ILogger logger, string action, string requesterId, string? targetRef);
}
