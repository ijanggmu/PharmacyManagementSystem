using System.Globalization;
using FSH.Modules.Identity.Contracts.Approvals;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.Services;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Internal control on re-pricing: a selling price below the cost price sells at a loss, so a user who can't
/// approve such a change themselves (<see cref="IdentityPermissions.Approvals.Approve"/>) needs a manager approval
/// for it, bound to the medicine/lot and covering the per-unit shortfall.
/// </summary>
internal static class PriceBelowCostGuard
{
    public static async Task EnsureAllowedAsync(
        IApprovalService approvals,
        decimal sellingPrice,
        decimal costPrice,
        Guid targetId,
        string label,
        IReadOnlyCollection<string>? approvalTokens,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(approvals);
        if (costPrice <= 0m || sellingPrice <= 0m || sellingPrice >= costPrice)
        {
            return;
        }

        decimal shortfall = decimal.Round(costPrice - sellingPrice, 2, MidpointRounding.AwayFromZero);
        string description = string.Create(
            CultureInfo.InvariantCulture,
            $"selling {label} at {sellingPrice:N2} is {shortfall:N2} below its cost of {costPrice:N2}.");

        _ = await approvals.AuthorizeAsync(
                new ApprovalRequirement(ApprovalActions.PriceBelowCost, shortfall, targetId.ToString(), description),
                approvalTokens,
                IdentityPermissions.Approvals.Approve,
                cancellationToken)
            .ConfigureAwait(false);
    }
}
