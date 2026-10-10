namespace FSH.Modules.Identity.Contracts.Services;

/// <summary>
/// Details for the admin of a tenant that is about to be provisioned, which the tenant record itself
/// doesn't carry: the admin's real name and phone, and an optional external login to link (sign-up with
/// Google). The Identity seed step applies them when it creates the tenant's admin user.
/// </summary>
public sealed record StagedTenantAdminProfile(
    string TenantId,
    string Email,
    string? FirstName,
    string? LastName,
    string? PhoneNumber,
    string? ExternalLoginProvider = null,
    string? ExternalProviderKey = null,
    string? ExternalDisplayName = null);

public interface ITenantAdminProfileStaging
{
    /// <summary>Stages (replacing any earlier staging for the same tenant id) the admin profile for a tenant
    /// about to be created. Only applied when the seed step <em>creates</em> the admin user, never to an
    /// existing one, and ignored once stale.</summary>
    Task StageAsync(StagedTenantAdminProfile profile, CancellationToken ct = default);
}
