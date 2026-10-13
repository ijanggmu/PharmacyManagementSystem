using FSH.Modules.Identity.Contracts.Approvals;

namespace FSH.Modules.Identity.Contracts.Services;

/// <summary>
/// Server-side check for a restricted action that a second person (an approver, holding
/// <c>Permissions.Approvals.Approve</c>) has to sign off. Approvals are issued by
/// <c>POST /api/v1/identity/approvals</c> after the approver re-enters their password, are short-lived and
/// single-use, and are bound to the requesting user, the action, an amount ceiling and a target.
/// </summary>
public interface IApprovalService
{
    /// <summary>
    /// Authorizes <paramref name="requirement"/> for the current user. Returns <c>null</c> without touching any
    /// token when the user holds <paramref name="directPermission"/> (they may do this themselves). Otherwise
    /// redeems one of <paramref name="approvalTokens"/> that is bound to this user, action and target, covers the
    /// amount, and has not expired or been used — or throws a 403 <c>ApprovalRequiredException</c> whose
    /// <c>errors</c> carry <c>["approval_required", action, amount, targetRef]</c> so the client can ask for one.
    /// Redeeming joins the caller's open transaction on the shared connection when there is one, so a rolled-back
    /// action leaves the approval unused.
    /// </summary>
    Task<ApprovalGrantDto?> AuthorizeAsync(
        ApprovalRequirement requirement,
        IReadOnlyCollection<string>? approvalTokens,
        string? directPermission = null,
        CancellationToken cancellationToken = default);
}
