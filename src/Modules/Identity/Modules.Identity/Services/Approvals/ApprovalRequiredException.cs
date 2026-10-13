using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Approvals;

namespace FSH.Modules.Identity.Services.Approvals;

/// <summary>
/// 403 telling the client that the action needs a manager approval. The ProblemDetails title is this type's
/// name and <c>errors</c> is the machine-readable <c>["approval_required", action, amount, targetRef]</c>, which
/// the web app's approval dialog reads to ask an approver for exactly this action.
/// </summary>
public sealed class ApprovalRequiredException : CustomException
{
    public const string Marker = "approval_required";

    public ApprovalRequiredException(ApprovalRequirement requirement)
        : base(MessageFor(requirement), ErrorsFor(requirement), HttpStatusCode.Forbidden)
    {
        Requirement = requirement;
    }

    public ApprovalRequiredException()
        : base("Manager approval is required.", (IEnumerable<string>?)null, HttpStatusCode.Forbidden)
    {
    }

    public ApprovalRequiredException(string message)
        : base(message, (IEnumerable<string>?)null, HttpStatusCode.Forbidden)
    {
    }

    public ApprovalRequiredException(string message, Exception innerException)
        : base(message, innerException, HttpStatusCode.Forbidden)
    {
    }

    public ApprovalRequirement? Requirement { get; }

    private static string MessageFor(ApprovalRequirement requirement)
    {
        ArgumentNullException.ThrowIfNull(requirement);
        return $"Manager approval is required: {requirement.Description}";
    }

    private static List<string> ErrorsFor(ApprovalRequirement requirement) =>
    [
        Marker,
        requirement.Action,
        requirement.Amount.ToString("0.##", CultureInfo.InvariantCulture),
        requirement.TargetRef ?? string.Empty,
    ];
}
