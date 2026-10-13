namespace FSH.Modules.Identity.Domain;

/// <summary>
/// One manager approval: an approver (who re-entered their password) signed off <see cref="Action"/> for
/// <see cref="Amount"/> on <see cref="TargetRef"/>, for the user <see cref="RequestedByUserId"/>. The row is also
/// the approvals log entry. Only the SHA-256 of the bearer token is stored; the token itself is returned once.
/// It can be redeemed once (<see cref="UsedAtUtc"/>, also the concurrency token) and only before
/// <see cref="ExpiresAtUtc"/>. Tenant-scoped by default (BaseDbContext/ApplyTenantIsolationByDefault).
/// </summary>
public sealed class ApprovalGrant
{
    public Guid Id { get; private set; }
    public string TokenHash { get; private set; } = default!;
    public string Action { get; private set; } = default!;
    public decimal Amount { get; private set; }
    public string? TargetRef { get; private set; }
    public string? Reason { get; private set; }
    public string RequestedByUserId { get; private set; } = default!;
    public string? RequestedByName { get; private set; }
    public string ApproverUserId { get; private set; } = default!;
    public string? ApproverName { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime ExpiresAtUtc { get; private set; }
    public DateTime? UsedAtUtc { get; private set; }

    private ApprovalGrant() { }

    public static ApprovalGrant Issue(
        string tokenHash,
        string action,
        decimal amount,
        string? targetRef,
        string? reason,
        string requestedByUserId,
        string? requestedByName,
        string approverUserId,
        string? approverName,
        DateTime nowUtc,
        TimeSpan lifetime)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tokenHash);
        ArgumentException.ThrowIfNullOrWhiteSpace(action);
        ArgumentException.ThrowIfNullOrWhiteSpace(requestedByUserId);
        ArgumentException.ThrowIfNullOrWhiteSpace(approverUserId);

        return new ApprovalGrant
        {
            Id = Guid.CreateVersion7(),
            TokenHash = tokenHash,
            Action = action,
            Amount = amount,
            TargetRef = targetRef,
            Reason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim(),
            RequestedByUserId = requestedByUserId,
            RequestedByName = requestedByName,
            ApproverUserId = approverUserId,
            ApproverName = approverName,
            CreatedAtUtc = nowUtc,
            ExpiresAtUtc = nowUtc.Add(lifetime),
        };
    }

    public bool IsRedeemableAt(DateTime nowUtc) => UsedAtUtc is null && nowUtc < ExpiresAtUtc;

    /// <summary>Marks the approval used. Throws when it already was or has expired.</summary>
    public void Redeem(DateTime nowUtc)
    {
        if (!IsRedeemableAt(nowUtc))
        {
            throw new InvalidOperationException("The approval has already been used or has expired.");
        }

        UsedAtUtc = nowUtc;
    }

    /// <summary>Log status: <c>used</c>, <c>expired</c> or <c>open</c>.</summary>
    public static string StatusOf(DateTime? usedAtUtc, DateTime expiresAtUtc, DateTime nowUtc)
    {
        if (usedAtUtc is not null)
        {
            return "used";
        }

        return nowUtc >= expiresAtUtc ? "expired" : "open";
    }
}
