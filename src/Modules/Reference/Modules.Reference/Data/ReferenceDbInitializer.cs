using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Reference.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Reference.Data;

public sealed class ReferenceDbInitializer(
    ReferenceDbContext dbContext,
    ILogger<ReferenceDbInitializer> logger,
    IMultiTenantContextAccessor<AppTenantInfo>? tenantAccessor = null) : IDbInitializer
{
    public async Task MigrateAsync(CancellationToken cancellationToken)
    {
        if ((await dbContext.Database.GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).Any())
        {
            await dbContext.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);
            logger.LogInformation("[Reference] applied migrations");
        }
    }

    /// <summary>
    /// Every tenant needs exactly one <see cref="PharmacySettings"/> row — seed a default
    /// on first run so <c>GetPharmacySettingsQuery</c> never has to special-case "not yet created".
    /// Medicine categories are NOT auto-seeded; a fresh tenant starts empty, same as Catalog.
    /// </summary>
    public async Task SeedAsync(CancellationToken cancellationToken)
    {
        if (await dbContext.PharmacySettings.AnyAsync(cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        // The pharmacy signed up under its own name; receipts and the letterhead start from it.
        string? tenantName = tenantAccessor?.MultiTenantContext?.TenantInfo?.Name;
        dbContext.PharmacySettings.Add(PharmacySettings.CreateDefault(
            string.IsNullOrWhiteSpace(tenantName) ? "My Pharmacy" : tenantName));
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        logger.LogInformation("[Reference] seeded default pharmacy settings");
    }
}
