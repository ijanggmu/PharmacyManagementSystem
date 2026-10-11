using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Identity.Services;

/// <inheritdoc cref="ITenantAdminProfileStaging"/>
public sealed class TenantAdminProfileStaging(IdentityDbContext dbContext, TimeProvider timeProvider) : ITenantAdminProfileStaging
{
    public async Task StageAsync(StagedTenantAdminProfile profile, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(profile);

        // One staging per tenant id: an earlier, abandoned attempt for the same code is replaced.
        await dbContext.PendingTenantAdminProfiles
            .Where(p => p.TenantId == profile.TenantId)
            .ExecuteDeleteAsync(ct)
            .ConfigureAwait(false);

        dbContext.PendingTenantAdminProfiles.Add(PendingTenantAdminProfile.Create(
            profile.TenantId, profile.Email, profile.FirstName, profile.LastName, profile.PhoneNumber,
            profile.ExternalLoginProvider, profile.ExternalProviderKey, profile.ExternalDisplayName,
            timeProvider.GetUtcNow().UtcDateTime));
        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
    }
}
