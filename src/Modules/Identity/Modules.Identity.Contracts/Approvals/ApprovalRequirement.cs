namespace FSH.Modules.Identity.Contracts.Approvals;

/// <summary>
/// What a guarded action needs approved: the <paramref name="Action"/> (see <see cref="ApprovalActions"/>),
/// the <paramref name="Amount"/> the approval must cover (an approval for a larger amount covers a smaller one)
/// and the <paramref name="TargetRef"/> it must be bound to — the sale/batch id, or the checkout's idempotency
/// key for a sale that doesn't exist yet. <paramref name="Description"/> is shown to the cashier.
/// </summary>
public sealed record ApprovalRequirement(string Action, decimal Amount, string? TargetRef, string Description)
{
    /// <summary>Paisa tolerance when comparing an approved amount with the amount needed.</summary>
    public const decimal Tolerance = 0.005m;

    /// <summary>True when an approval for <paramref name="approvedAmount"/> covers this requirement.</summary>
    public bool IsCoveredBy(decimal approvedAmount) => approvedAmount + Tolerance >= Amount;

    /// <summary>A target reference as stored and compared: trimmed, empty treated as none.</summary>
    public static string? NormalizeTarget(string? targetRef) =>
        string.IsNullOrWhiteSpace(targetRef) ? null : targetRef.Trim();
}
