using FSH.Framework.Shared.Persistence;
using Mediator;

namespace FSH.Modules.Identity.Contracts.v1.Approvals;

/// <summary>The approvals log: every approval issued in this tenant, newest first.</summary>
public sealed class SearchApprovalsQuery : IPagedQuery, IQuery<PagedResponse<ApprovalLogEntryDto>>
{
    public int? PageNumber { get; set; }

    public int? PageSize { get; set; }

    public string? Sort { get; set; }

    /// <summary>One action (see <c>ApprovalActions</c>), or all.</summary>
    public string? Action { get; set; }

    public DateTime? FromUtc { get; set; }

    public DateTime? ToUtc { get; set; }

    /// <summary>Matches the approver's or requester's name, or the target reference.</summary>
    public string? Search { get; set; }
}

/// <summary>One approval: what was approved, by whom, for whom, and whether it was used.
/// <paramref name="Status"/> is <c>used</c>, <c>expired</c> or <c>open</c>.</summary>
public sealed record ApprovalLogEntryDto(
    Guid Id,
    string Action,
    decimal Amount,
    string? TargetRef,
    string? Reason,
    string RequestedByUserId,
    string? RequestedByName,
    string ApproverUserId,
    string? ApproverName,
    DateTime ApprovedAtUtc,
    DateTime ExpiresAtUtc,
    DateTime? UsedAtUtc,
    string Status);
