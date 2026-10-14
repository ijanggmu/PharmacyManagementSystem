using FSH.Framework.Core.Context;
using FSH.Framework.Shared.Constants;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// The name stamped on a document as who did it: the user's full name, else their first name, else their email, else
/// their id. A name that is just the tenant id is skipped — the seeded tenant admin is created with the tenant id as
/// its first name, which would otherwise make every document look as if the pharmacy itself signed it.
/// </summary>
internal static class ActorName
{
    public static string Of(ICurrentUser currentUser)
    {
        ArgumentNullException.ThrowIfNull(currentUser);

        string? tenant = currentUser.GetTenant();
        string? fullName = currentUser.GetUserClaims()?.FirstOrDefault(c => c.Type == ClaimConstants.Fullname)?.Value;
        foreach (string? candidate in new[] { fullName, currentUser.Name })
        {
            if (string.IsNullOrWhiteSpace(candidate))
            {
                continue;
            }

            string name = candidate.Trim();
            bool isTenantPlaceholder = tenant is not null
                && (string.Equals(name, tenant, StringComparison.OrdinalIgnoreCase)
                    || name.StartsWith(tenant + " ", StringComparison.OrdinalIgnoreCase));
            if (!isTenantPlaceholder)
            {
                return name;
            }
        }

        string? email = currentUser.GetUserEmail();
        return string.IsNullOrWhiteSpace(email) ? currentUser.GetUserId().ToString() : email.Trim();
    }
}
