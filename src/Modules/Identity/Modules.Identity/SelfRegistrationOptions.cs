using FSH.Framework.Shared.Multitenancy;

namespace FSH.Modules.Identity;

/// <summary>
/// Per-tenant opt-in for anonymous self-registration (<c>POST /identity/self-register</c>). OFF by
/// default: with no tenants listed the endpoint answers 404 for everyone. A pharmacy tenant's staff
/// accounts are created by its admin; open sign-up into an existing tenant is only for deployments
/// that explicitly want it. The root (operator) tenant can never be self-registered into.
/// </summary>
public sealed class SelfRegistrationOptions
{
    public const string SectionName = "SelfRegistration";

    /// <summary>Tenant ids that accept self-registration. <c>"*"</c> allows every non-root tenant.</summary>
    public IReadOnlyList<string> AllowedTenants { get; set; } = [];

    public bool IsAllowed(string? tenantId)
    {
        if (string.IsNullOrWhiteSpace(tenantId)
            || string.Equals(tenantId, MultitenancyConstants.Root.Id, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return AllowedTenants.Any(t => t == "*" || string.Equals(t, tenantId, StringComparison.OrdinalIgnoreCase));
    }
}
