using Mediator;

namespace FSH.Modules.Identity.Contracts.v1.Approvals;

/// <summary>
/// An approver (email or user name + password, re-verified here) signs off one restricted action for the
/// signed-in user. Returns a short-lived, single-use token the requester sends with the action.
/// </summary>
public sealed record IssueApprovalCommand(
    string ApproverLogin,
    string Password,
    string Action,
    decimal Amount,
    string? TargetRef,
    string? Reason = null) : ICommand<IssueApprovalResponse>;

public sealed record IssueApprovalResponse(string Token, Guid ApprovalId, DateTime ExpiresAtUtc, string? ApproverName);
