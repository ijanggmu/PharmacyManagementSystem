using FSH.Framework.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Payroll.Data;

/// <summary>Applies the payroll schema. Nothing to seed: the settings row is created with the defaults on first use
/// (<see cref="Services.PayrollSettingsStore"/>).</summary>
public sealed class PayrollDbInitializer(PayrollDbContext dbContext, ILogger<PayrollDbInitializer> logger) : IDbInitializer
{
    public async Task MigrateAsync(CancellationToken cancellationToken)
    {
        if ((await dbContext.Database.GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).Any())
        {
            await dbContext.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);
            logger.LogInformation("[Payroll] applied migrations");
        }
    }

    public Task SeedAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
