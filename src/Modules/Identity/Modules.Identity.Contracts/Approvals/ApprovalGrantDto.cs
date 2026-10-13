namespace FSH.Modules.Identity.Contracts.Approvals;

/// <summary>An approval that was redeemed for a guarded action: who approved it and for how much.</summary>
public sealed record ApprovalGrantDto(
    Guid Id,
    string Action,
    decimal Amount,
    string? TargetRef,
    string ApproverUserId,
    string? ApproverName,
    DateTime ApprovedAtUtc);
