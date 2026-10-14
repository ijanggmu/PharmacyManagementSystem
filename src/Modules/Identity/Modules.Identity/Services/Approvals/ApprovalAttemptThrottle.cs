using Microsoft.Extensions.Caching.Hybrid;

namespace FSH.Modules.Identity.Services.Approvals;

/// <summary>
/// Throttles failed manager-approval attempts per requester, and per requester + approver login, in fixed
/// windows. Approvals deliberately never touch the approver's sign-in lockout counter (that would let any
/// signed-in user lock the owner out with five wrong passwords), so this is what stops the dialog being used
/// to guess an approver's password.
/// </summary>
public sealed class ApprovalAttemptThrottle(HybridCache cache, TimeProvider timeProvider)
{
    /// <summary>Length of one counting window.</summary>
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(15);

    /// <summary>Failed attempts one requester may make against one approver per window.</summary>
    public const int MaxFailuresPerApprover = 5;

    /// <summary>Failed attempts one requester may make in total per window (guards spraying many approvers).</summary>
    public const int MaxFailuresPerRequester = 10;

    private static readonly HybridCacheEntryOptions EntryOptions = new()
    {
        Expiration = Window,
        LocalCacheExpiration = Window,
        Flags = HybridCacheEntryFlags.DisableCompression,
    };

    /// <summary>True when the requester has used up either allowance for the current window.</summary>
    public async Task<bool> IsBlockedAsync(string tenantId, string requesterId, string approverLogin, CancellationToken cancellationToken = default)
    {
        long bucket = CurrentBucket();
        int perRequester = await ReadAsync(RequesterKey(tenantId, requesterId, bucket), cancellationToken).ConfigureAwait(false);
        if (perRequester >= MaxFailuresPerRequester)
        {
            return true;
        }

        int perPair = await ReadAsync(PairKey(tenantId, requesterId, approverLogin, bucket), cancellationToken).ConfigureAwait(false);
        return perPair >= MaxFailuresPerApprover;
    }

    /// <summary>Counts one failed attempt (unknown approver, wrong password or approver without the permission).</summary>
    public async Task RecordFailureAsync(string tenantId, string requesterId, string approverLogin, CancellationToken cancellationToken = default)
    {
        long bucket = CurrentBucket();
        await IncrementAsync(RequesterKey(tenantId, requesterId, bucket), cancellationToken).ConfigureAwait(false);
        await IncrementAsync(PairKey(tenantId, requesterId, approverLogin, bucket), cancellationToken).ConfigureAwait(false);
    }

    /// <summary>A successful approval clears the requester's count against that approver.</summary>
    public Task ResetPairAsync(string tenantId, string requesterId, string approverLogin, CancellationToken cancellationToken = default)
        => cache.RemoveAsync(PairKey(tenantId, requesterId, approverLogin, CurrentBucket()), cancellationToken).AsTask();

    private long CurrentBucket() => timeProvider.GetUtcNow().UtcTicks / Window.Ticks;

    private static string RequesterKey(string tenantId, string requesterId, long bucket)
        => $"identity:approval-failures:{tenantId}:{requesterId}:{bucket}";

    private static string PairKey(string tenantId, string requesterId, string approverLogin, long bucket)
        => $"identity:approval-failures:{tenantId}:{requesterId}:{approverLogin.Trim().ToUpperInvariant()}:{bucket}";

    private ValueTask<int> ReadAsync(string key, CancellationToken cancellationToken)
        => cache.GetOrCreateAsync(key, static _ => ValueTask.FromResult(0), EntryOptions, cancellationToken: cancellationToken);

    // Read-then-write is not atomic across concurrent requests; a throttle can tolerate a missed count or two.
    private async Task IncrementAsync(string key, CancellationToken cancellationToken)
    {
        int count = await ReadAsync(key, cancellationToken).ConfigureAwait(false);
        await cache.SetAsync(key, count + 1, EntryOptions, cancellationToken: cancellationToken).ConfigureAwait(false);
    }
}
