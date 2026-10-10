using FSH.Framework.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Sales.Data;

public sealed class SalesDbInitializer(
    SalesDbContext dbContext,
    ILogger<SalesDbInitializer> logger) : IDbInitializer
{
    public async Task MigrateAsync(CancellationToken cancellationToken)
    {
        if ((await dbContext.Database.GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).Any())
        {
            await dbContext.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);
            logger.LogInformation("[Sales] applied migrations");
        }
    }

    /// <summary>No auto-seed — a fresh tenant starts with no sales.</summary>
    public Task SeedAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
