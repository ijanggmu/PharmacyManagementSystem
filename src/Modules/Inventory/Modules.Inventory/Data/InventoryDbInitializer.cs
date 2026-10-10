using FSH.Framework.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Inventory.Data;

public sealed class InventoryDbInitializer(
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

    /// <summary>No auto-seed — a fresh tenant starts with an empty catalog, same as Catalog/Reference.</summary>
    public Task SeedAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
