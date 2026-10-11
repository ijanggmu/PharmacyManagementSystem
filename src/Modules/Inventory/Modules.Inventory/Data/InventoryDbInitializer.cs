using FSH.Framework.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Inventory.Data;

public sealed partial class InventoryDbInitializer(
    InventoryDbContext dbContext,
    ILogger<InventoryDbInitializer> logger) : IDbInitializer
{
    public async Task MigrateAsync(CancellationToken cancellationToken)
    {
        if ((await dbContext.Database.GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).Any())
        {
            await dbContext.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);
            logger.LogInformation("[Inventory] applied migrations");
        }
    }

    /// <summary>
    /// Tenant-owned data (medicines, stock) is never auto-seeded — a fresh tenant starts empty. Only the
    /// shared, cross-tenant Nepal medicine directory is filled, so "Add medicine" can prefill from it.
    /// </summary>
    public async Task SeedAsync(CancellationToken cancellationToken)
    {
        int added = await NepalMedicineCatalogSeed.SeedAsync(dbContext, cancellationToken).ConfigureAwait(false);
        if (added > 0)
        {
            LogCatalogSeeded(logger, added);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "[Inventory] seeded {Count} Nepal medicine catalog entries")]
    private static partial void LogCatalogSeeded(ILogger logger, int count);
}
