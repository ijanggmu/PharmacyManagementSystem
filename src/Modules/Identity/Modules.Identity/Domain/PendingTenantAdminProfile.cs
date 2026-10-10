using FSH.Framework.Core.Domain;

namespace FSH.Modules.Identity.Domain;

/// <summary>
/// The admin details a self-service sign-up collected for a tenant that is still being provisioned: real
/// name, phone and (for sign-up with Google) the external login to connect. The Identity seed step applies
/// it when it creates that tenant's admin user and then deletes it.
///
/// Implements <see cref="IGlobalEntity"/>: it is written from the anonymous sign-up request (root context)
/// for a tenant that doesn't exist yet, so the tenant is carried in <see cref="TenantId"/> explicitly.
/// </summary>
public class PendingTenantAdminProfile : IGlobalEntity
{
    /// <summary>Staging older than this is ignored and purged — a sign-up that never finished.</summary>
    public static readonly TimeSpan MaxAge = TimeSpan.FromDays(1);

    public Guid Id { get; private set; }
    public string TenantId { get; private set; } = default!;
    public string Email { get; private set; } = default!;
    public string? FirstName { get; private set; }
    public string? LastName { get; private set; }
    public string? PhoneNumber { get; private set; }
    public string? ExternalLoginProvider { get; private set; }
    public string? ExternalProviderKey { get; private set; }
    public string? ExternalDisplayName { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private PendingTenantAdminProfile() { }

    public static PendingTenantAdminProfile Create(
        string tenantId, string email, string? firstName, string? lastName, string? phoneNumber,
        string? externalLoginProvider, string? externalProviderKey, string? externalDisplayName, DateTime nowUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);
        ArgumentException.ThrowIfNullOrWhiteSpace(email);

        return new PendingTenantAdminProfile
        {
            Id = Guid.CreateVersion7(),
            TenantId = tenantId.Trim(),
            Email = email.Trim(),
            FirstName = Clean(firstName),
            LastName = Clean(lastName),
            PhoneNumber = Clean(phoneNumber),
            ExternalLoginProvider = Clean(externalLoginProvider),
            ExternalProviderKey = Clean(externalProviderKey),
            ExternalDisplayName = Clean(externalDisplayName),
            CreatedAtUtc = nowUtc,
        };
    }

    public bool IsStale(DateTime nowUtc) => nowUtc - CreatedAtUtc > MaxAge;

    public bool HasExternalLogin => ExternalLoginProvider is not null && ExternalProviderKey is not null;

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
